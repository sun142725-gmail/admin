// Axios 封装用于统一请求与自动刷新令牌。
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { store } from '../store';
import { clearTokens, setTokens } from '../store/authSlice';
import { enqueueLogEvent } from '../utils/logBatcher';
import { uuid } from '../utils/uuid';

const CLIENT_SOURCE = 'web';
const LOG_ENDPOINT = '/log-center/events';
// 慢请求阈值：正常成功请求不记捕获细节（避免刷库淹没关键信息），仅记录流水；慢请求与失败请求补全捕获
const SLOW_API_MS = 1000;

// ---- 日志捕获工具：请求头/请求体/响应体脱敏与截断 ----
// 敏感头永不落日志；敏感字段（密码/令牌/验证码）值替换为 ***
const SENSITIVE_HEADER_KEYS = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-refresh-token']);
const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'oldPassword',
  'newPassword',
  'confirmPassword',
  'refreshToken',
  'accessToken',
  'verifyCode',
  'verificationCode'
]);
// 单字段捕获截断：与 logBatcher 的 meta 预算配合（服务端单事件上限 4000 字符）
const MAX_CAPTURE_CHARS = 1000;
// 大数组折叠阈值：列表接口响应整体序列化截断由 logBatcher 兜底，这里先控制条目数
const MAX_CAPTURE_ARRAY = 30;

const truncateText = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}…[截断，原长 ${value.length}]` : value;

// 递归脱敏+截断：key 命中敏感词替换值；字符串超长截断；base64 图片/音频/视频只留占位
const redactValue = (key: string, value: unknown): unknown => {
  if (SENSITIVE_BODY_KEYS.has(key)) {
    return '***';
  }
  if (typeof value === 'string') {
    if (/^data:(image|audio|video)\//.test(value)) {
      return `[base64 ${value.length} 字符已省略]`;
    }
    return truncateText(value, MAX_CAPTURE_CHARS);
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_CAPTURE_ARRAY) {
      return `[Array(${value.length})]`;
    }
    return value.map((item) => redactValue(key, item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      out[childKey] = redactValue(childKey, childValue);
    });
    return out;
  }
  return value;
};

const redactHeaders = (headers: unknown): Record<string, unknown> | undefined => {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '***' : redactValue(key, value);
  });
  return out;
};

interface CaptureConfig {
  method?: string;
  url?: string;
  headers?: unknown;
  data?: unknown;
  params?: unknown;
}

// 从完整/相对 URL 解析 host；相对地址按当前站点 origin 解析
const resolveHost = (rawUrl?: string): string | undefined => {
  if (!rawUrl) {
    return undefined;
  }
  try {
    return new URL(rawUrl, window.location.origin).host;
  } catch {
    return undefined;
  }
};

// 请求快照：方法/host/URL/query/脱敏请求头/脱敏请求体（请求拦截器阶段 data 还是原始对象）。
// response 存在时优先取 XHR 的 responseURL（含重定向后的真实地址与 host）
const buildRequestCapture = (config?: CaptureConfig, response?: { responseURL?: string }) => {
  if (!config) {
    return undefined;
  }
  const rawUrl = response?.responseURL ?? axios.getUri(config as AxiosRequestConfig);
  return {
    method: (config.method ?? 'GET').toUpperCase(),
    ...(resolveHost(rawUrl) ? { host: resolveHost(rawUrl) } : {}),
    url: config.url,
    ...(config.params !== undefined && Object.keys(config.params as object).length
      ? { query: redactValue('query', config.params) }
      : {}),
    ...(config.headers ? { headers: redactHeaders(config.headers) } : {}),
    ...(config.data !== undefined ? { body: redactValue('body', config.data) } : {})
  };
};

const buildResponseCapture = (payload: unknown, status?: number, duration?: number, headers?: unknown) => ({
  ...(status !== undefined ? { status } : {}),
  ...(duration !== undefined ? { duration } : {}),
  ...(headers ? { headers: redactHeaders(headers) } : {}),
  ...(payload !== undefined ? { body: redactValue('responseBody', payload) } : {})
});

const http = axios.create({
  baseURL: '/api',
  timeout: 10000
});

// 类型契约：响应拦截器已把返回值解包为统一响应结构的 data（运行时如此，类型此前没跟上）。
// 因此方法泛型 = 业务数据类型，而非 AxiosResponse。兼容两种写法：
//   http.get<User[]>(url)                      单泛型（推荐，T 即业务数据）
//   http.get<never, FlowDetail>(url)           存量双泛型（R 指定返回类型）
//   http.get(url)                              无泛型 = any（存量页面，逐步迁移）
interface HttpClient {
  get<T = any, R = T>(url: string, config?: AxiosRequestConfig): Promise<R>;
  post<T = any, R = T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<R>;
  put<T = any, R = T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<R>;
  patch<T = any, R = T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<R>;
  delete<T = any, R = T>(url: string, config?: AxiosRequestConfig): Promise<R>;
  // 保留 AxiosInstance 自身能力（拦截器/默认值配置）供本文件与极端场景使用
  interceptors: AxiosInstance['interceptors'];
  defaults: AxiosInstance['defaults'];
}

let isRefreshing = false;
let pending: Array<(token: string | null) => void> = [];

const notifyPending = (token: string | null) => {
  pending.forEach((cb) => cb(token));
  pending = [];
};

http.interceptors.request.use((config) => {
  const token = store.getState().auth.accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers = config.headers ?? {};
  config.headers['x-source'] = CLIENT_SOURCE;
  config.headers['x-trace-id'] = uuid();
  (config as any).metadata = { startTime: Date.now() };
  return config;
});

http.interceptors.response.use(
  (response) => {
    const payload = response.data;
    const config = response.config;
    const url = config?.url ?? '';
    const duration = Date.now() - ((config as any).metadata?.startTime ?? Date.now());
    if (!url.includes(LOG_ENDPOINT)) {
      // 响应体没有 traceId 时回退用请求头里生成的值，保证事件可关联
      const headerTraceId = (config?.headers?.['x-trace-id'] as string | undefined) ?? undefined;
      const traceId = (payload?.traceId as string | undefined) ?? headerTraceId;
      const method = (config?.method ?? 'GET').toUpperCase();
      if (payload?.code !== 0) {
        // HTTP 200 但业务码非 0：error 事件带完整请求/响应捕获（HTTP 错误分支同）
        enqueueLogEvent({
          type: 'error',
          traceId,
          payload: {
            message: `业务失败 ${method} ${url}: ${payload?.message ?? ''}`,
            meta: {
              code: payload?.code,
              url,
              duration,
              request: buildRequestCapture(config, response.request),
              response: buildResponseCapture(payload, response.status, duration, response.headers)
            }
          }
        });
      } else {
        // 全量 API 流水（info）：还原会话完整请求链路；慢请求升 warn 并补全捕获。
        // message 不含耗时，重复轮询可被去重窗口合并计数
        const isSlow = duration >= SLOW_API_MS;
        enqueueLogEvent({
          type: 'frontend',
          traceId,
          payload: {
            level: isSlow ? 'warn' : 'info',
            category: 'api',
            message: `${isSlow ? '慢请求 ' : ''}${method} ${url} ${response.status}`,
            meta: isSlow
              ? {
                  duration,
                  request: buildRequestCapture(config, response.request),
                  response: buildResponseCapture(payload, response.status, duration, response.headers)
                }
              : { duration }
          }
        });
      }
    }
    if (payload?.code !== 0) {
      return Promise.reject(new Error(payload?.message ?? '请求失败'));
    }
    return payload.data;
  },
  async (error) => {
    const { response, config } = error;
    const url = config?.url ?? '';
    if (!url.includes(LOG_ENDPOINT)) {
      const headerTraceId = (config?.headers?.['x-trace-id'] as string | undefined) ?? undefined;
      const traceId = (response?.data?.traceId as string | undefined) ?? headerTraceId;
      const method = (config?.method ?? 'GET').toUpperCase();
      if (response) {
        enqueueLogEvent({
          type: 'error',
          traceId,
          payload: {
            message: `${method} ${url} -> ${response.status}`,
            stack: typeof response.data?.message === 'string' ? response.data.message : undefined,
            meta: {
              status: response.status,
              url,
              request: buildRequestCapture(config, response.request),
              response: buildResponseCapture(response.data, response.status, undefined, response.headers)
            }
          }
        });
      } else {
        // 网络层失败（断网/DNS/超时/被拦截）没有响应体，是排查"用户说打不开"的关键信号
        enqueueLogEvent({
          type: 'error',
          traceId: headerTraceId,
          payload: {
            message: `网络错误 ${method} ${url}`,
            stack: error?.message,
            meta: {
              network: true,
              timeout: Boolean(config?.timeout && error?.code === 'ECONNABORTED'),
              url,
              request: buildRequestCapture(config)
            }
          }
        });
      }
    }
    if (!response || response.status !== 401 || (config as any)._retry) {
      return Promise.reject(error);
    }

    const refreshToken = store.getState().auth.refreshToken;
    if (!refreshToken) {
      store.dispatch(clearTokens());
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pending.push((token) => {
          if (!token) {
            reject(error);
            return;
          }
          config.headers.Authorization = `Bearer ${token}`;
          // 重放请求同样标记 _retry：若重放再次 401（tokenVersion 变更等），直接失败不再触发第二轮刷新
          (config as any)._retry = true;
          // 重置计时起点，否则慢请求日志会把 token 刷新耗时也算进接口耗时
          (config as any).metadata = { startTime: Date.now() };
          resolve(http(config));
        });
      });
    }

    isRefreshing = true;
    (config as any)._retry = true;
    try {
      const refreshResponse = await axios.post('/api/auth/refresh', { refreshToken });
      if (refreshResponse.data?.code !== 0) {
        throw new Error('刷新失败');
      }
      const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data.data;
      store.dispatch(setTokens({ accessToken, refreshToken: newRefreshToken }));
      notifyPending(accessToken);
      config.headers.Authorization = `Bearer ${accessToken}`;
      return http(config);
    } catch (refreshError) {
      notifyPending(null);
      store.dispatch(clearTokens());
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default http as HttpClient;
