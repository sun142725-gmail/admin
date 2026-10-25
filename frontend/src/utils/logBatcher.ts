// 日志批量上报用于合并埋点与前端日志请求。
// 可靠性设计：
// 1. 队列有上限（超限丢最旧），后端长时间不可用时不会撑爆内存；
// 2. 4xx 拒绝直接丢弃（重试也不可能成功，避免"毒丸"事件堵塞队列），5xx/网络错误才重排；
// 3. 单批重试有上限，超过即放弃，防止死循环；
// 4. 入队前截断超长字段，避免触发服务端 payload 大小限制导致整批被拒；
// 5. 页面隐藏/关闭时兜底发送（keepalive），减少最后一批日志丢失。
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
// 与服务端 MAX_PAYLOAD_CHARS（4000 字符）保持安全余量
const MAX_MESSAGE_CHARS = 1000;
const MAX_STACK_CHARS = 2000;
const MAX_META_CHARS = 1200;

let queue: LogEvent[] = [];
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

// 入队前收敛单条事件体积，防止一条超大日志让整批上报被服务端拒绝
const sanitizeEvent = (event: LogEvent): LogEvent => {
  const payload = { ...event.payload };
  if (typeof payload.message === 'string') {
    payload.message = truncate(payload.message, MAX_MESSAGE_CHARS);
  }
  if (typeof payload.stack === 'string') {
    payload.stack = truncate(payload.stack, MAX_STACK_CHARS);
  }
  if (payload.meta && typeof payload.meta === 'object') {
    const raw = JSON.stringify(payload.meta);
    if (raw.length > MAX_META_CHARS) {
      payload.meta = { notice: '原始 meta 超长已截断', raw: truncate(raw, MAX_META_CHARS) };
    }
  }
  return { ...event, payload };
};

export const enqueueLogEvent = (event: LogEvent) => {
  const payload: LogEvent = {
    ...sanitizeEvent(event),
    createdAt: event.createdAt ?? new Date().toISOString()
  };
  queue.push(payload);
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

export const flushQueue = async () => {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) {
    return;
  }
  const batch = queue;
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
    queue = batch.concat(queue);
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
    const batch: LogEvent[] = [];
    let size = 0;
    while (queue.length && batch.length < MAX_BATCH) {
      const next = JSON.stringify(queue[0]);
      if (size + next.length > 60000 && batch.length) {
        break;
      }
      batch.push(queue.shift() as LogEvent);
      size += next.length;
    }
    void fetch('/api/log-center/events', {
      method: 'POST',
      keepalive: true,
      headers,
      body: JSON.stringify({ source: SOURCE, sessionId: getSessionId(), events: batch })
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
