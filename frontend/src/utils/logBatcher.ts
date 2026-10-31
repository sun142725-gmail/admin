// 日志批量上报用于合并埋点与前端日志请求。
// 可靠性设计：
// 1. 队列有上限（超限丢最旧），后端长时间不可用时不会撑爆内存；
// 2. 4xx 拒绝直接丢弃（重试也不可能成功，避免"毒丸"事件堵塞队列），5xx/网络错误才重排；
// 3. 单批重试有上限，超过即放弃，防止死循环；
// 4. 入队前截断超长字段，避免触发服务端 payload 大小限制导致整批被拒；
// 5. 页面隐藏/关闭时兜底发送（keepalive），减少最后一批日志丢失；
// 6. 短窗口内同 type+message+stack 的前端/错误事件去重计数（meta.repeat），防止同类错误刷屏淹没队列；
// 7. 前端/错误事件自动注入 appVersion（vite define 注入的 构建版本+git 短哈希），线上报错可定位构建。
import { postLogEvents, LogEvent } from '../api/logCenter';
import { store } from '../store';
import { uuid } from './uuid';

const SESSION_KEY = 'rbac_session_id';
const SOURCE = 'web';
const MAX_BATCH = 20;
const FLUSH_INTERVAL = 5000;
// 队列上限：按每 5 秒一批、每批 20 条估算，可容纳约 75 秒的日志峰值
const MAX_QUEUE = 300;
// 单批最大重试次数：超过后放弃该批，避免后端持续 5xx 时无限重排
const MAX_RETRY = 3;
// 与服务端 MAX_PAYLOAD_CHARS（4000 字符）保持安全余量：meta 整体预算放大以容纳请求/响应捕获
const MAX_MESSAGE_CHARS = 1000;
const MAX_STACK_CHARS = 2000;
const MAX_META_CHARS = 3200;
// 请求/响应捕获单字段上限（headers/body 分别控制，避免一大块挤掉其他字段）
const CAPTURE_HEADER_CHARS = 600;
const CAPTURE_BODY_CHARS = 1000;
// 去重窗口与单条事件重复计数上限
const DEDUPE_WINDOW_MS = 3000;
const MAX_REPEAT = 9999;

interface QueueItem {
  event: LogEvent;
  count: number;
  firstAt: number;
  key: string;
}

let queue: QueueItem[] = [];
let timer: number | null = null;
let retryCount = 0;

export const getSessionId = () => {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuid();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
};

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}…[截断，原长 ${value.length}]` : value;

// 前端/错误事件自动带上构建版本；打点事件保持纯净
const injectAppVersion = (event: LogEvent): LogEvent => {
  if (event.type === 'track') {
    return event;
  }
  const baseMeta =
    event.payload.meta && typeof event.payload.meta === 'object'
      ? (event.payload.meta as Record<string, unknown>)
      : {};
  return {
    ...event,
    payload: { ...event.payload, meta: { appVersion: __APP_VERSION__, ...baseMeta } }
  };
};

// 捕获字段截断：对象超长时序列化进 raw，保留结构提示而不是丢弃
const truncateCapture = (value: unknown, max: number): unknown => {
  if (typeof value === 'string') {
    return truncate(value, max);
  }
  if (value && typeof value === 'object') {
    try {
      const raw = JSON.stringify(value);
      if (raw && raw.length <= max) {
        return value;
      }
      return { notice: `内容超长已截断（原 ${raw?.length ?? 0} 字符）`, raw: truncate(raw ?? '', max) };
    } catch {
      return String(value);
    }
  }
  return value;
};

// 入队前收敛单条事件体积，防止一条超大日志让整批上报被服务端拒绝。
// 请求/响应捕获按字段独立截断（headers/body），避免整体截断挤掉关键字段
const sanitizeEvent = (event: LogEvent): LogEvent => {
  const payload = { ...event.payload };
  if (typeof payload.message === 'string') {
    payload.message = truncate(payload.message, MAX_MESSAGE_CHARS);
  }
  if (typeof payload.stack === 'string') {
    payload.stack = truncate(payload.stack, MAX_STACK_CHARS);
  }
  if (payload.meta && typeof payload.meta === 'object') {
    const meta = { ...(payload.meta as Record<string, unknown>) };
    const request = meta.request as { headers?: unknown; body?: unknown } | undefined;
    if (request && typeof request === 'object') {
      meta.request = {
        ...request,
        ...(request.headers !== undefined
          ? { headers: truncateCapture(request.headers, CAPTURE_HEADER_CHARS) }
          : {}),
        ...(request.body !== undefined ? { body: truncateCapture(request.body, CAPTURE_BODY_CHARS) } : {})
      };
    }
    const response = meta.response as { headers?: unknown; body?: unknown } | undefined;
    if (response && typeof response === 'object') {
      meta.response = {
        ...response,
        ...(response.headers !== undefined
          ? { headers: truncateCapture(response.headers, CAPTURE_HEADER_CHARS) }
          : {}),
        ...(response.body !== undefined ? { body: truncateCapture(response.body, CAPTURE_BODY_CHARS) } : {})
      };
    }
    payload.meta = meta;
    const raw = JSON.stringify(payload.meta);
    if (raw.length > MAX_META_CHARS) {
      payload.meta = { notice: '原始 meta 超长已截断', raw: truncate(raw, MAX_META_CHARS) };
    }
  }
  return { ...event, payload };
};

// 同 type + message + stack 前 200 字符视为同类事件；打点/PV 每次都算独立事件不参与去重
const dedupeKey = (event: LogEvent): string | null => {
  if (event.type === 'track') {
    return null;
  }
  const message = typeof event.payload.message === 'string' ? event.payload.message : '';
  const stack = typeof event.payload.stack === 'string' ? event.payload.stack.slice(0, 200) : '';
  return `${event.type}|${message}|${stack}`;
};

export const enqueueLogEvent = (raw: LogEvent) => {
  const event = sanitizeEvent(injectAppVersion(raw));
  const key = dedupeKey(event);
  const now = Date.now();
  if (key) {
    // 窗口内同类事件合并计数：从队尾向前找最近的匹配项
    for (let i = queue.length - 1; i >= 0; i--) {
      const item = queue[i];
      if (item.key === key && now - item.firstAt < DEDUPE_WINDOW_MS) {
        item.count = Math.min(item.count + 1, MAX_REPEAT);
        return;
      }
    }
  }
  queue.push({ event, count: 1, firstAt: now, key: key ?? '' });
  // 超限丢弃最旧事件：最新日志对排查更有价值
  if (queue.length > MAX_QUEUE) {
    queue = queue.slice(-MAX_QUEUE);
  }
  if (queue.length >= MAX_BATCH) {
    flushQueue();
    return;
  }
  scheduleFlush();
};

const scheduleFlush = () => {
  if (timer) {
    return;
  }
  timer = window.setTimeout(() => {
    flushQueue();
  }, FLUSH_INTERVAL);
};

// 出队时把合并的重复次数写进 meta.repeat，服务端与详情页可见
const materialize = (item: QueueItem): LogEvent => {
  if (item.count <= 1) {
    return item.event;
  }
  const baseMeta =
    item.event.payload.meta && typeof item.event.payload.meta === 'object'
      ? (item.event.payload.meta as Record<string, unknown>)
      : {};
  return {
    ...item.event,
    payload: { ...item.event.payload, meta: { ...baseMeta, repeat: item.count } }
  };
};

export const flushQueue = async () => {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) {
    return;
  }
  const batch = queue.map(materialize);
  queue = [];
  try {
    await postLogEvents({
      source: SOURCE,
      sessionId: getSessionId(),
      events: batch
    });
    retryCount = 0;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    // 4xx 属于请求本身问题（校验失败/超限），重试无意义：丢弃本批避免毒丸堵塞
    if (status && status >= 400 && status < 500) {
      return;
    }
    retryCount += 1;
    if (retryCount > MAX_RETRY) {
      retryCount = 0;
      return;
    }
    // 失败重排：本批回队首（await 期间新入队的事件保持在其后），重新计时去重窗口
    queue = batch
      .map((event) => ({ event, count: 1, firstAt: Date.now(), key: dedupeKey(event) ?? '' }))
      .concat(queue);
    scheduleFlush();
  }
};

// 页面关闭时用 fetch keepalive 兜底发送（sendBeacon 无法携带 Authorization 头）。
// keepalive 请求体上限约 64KB，超限分批取尾部（最新）事件。
const flushWithKeepalive = () => {
  if (!queue.length) {
    return;
  }
  const token = store.getState().auth.accessToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-source': SOURCE
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  while (queue.length) {
    const items: QueueItem[] = [];
    let size = 0;
    while (queue.length && items.length < MAX_BATCH) {
      const next = JSON.stringify(materialize(queue[0]));
      if (size + next.length > 60000 && items.length) {
        break;
      }
      items.push(queue.shift() as QueueItem);
      size += next.length;
    }
    void fetch('/api/log-center/events', {
      method: 'POST',
      keepalive: true,
      headers,
      body: JSON.stringify({
        source: SOURCE,
        sessionId: getSessionId(),
        events: items.map(materialize)
      })
    }).catch(() => undefined);
  }
};

// 注册页面生命周期兜底：visibilitychange 覆盖移动端切后台，pagehide 覆盖关闭标签页
export const registerFlushHooks = () => {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushQueue();
    }
  });
  window.addEventListener('pagehide', flushWithKeepalive);
};
