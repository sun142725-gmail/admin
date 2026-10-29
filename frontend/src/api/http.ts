// Axios 封装用于统一请求与自动刷新令牌。
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { store } from '../store';
import { clearTokens, setTokens } from '../store/authSlice';
import { enqueueLogEvent } from '../utils/logBatcher';
import { uuid } from '../utils/uuid';

const CLIENT_SOURCE = 'web';
const LOG_ENDPOINT = '/log-center/events';
// 慢请求阈值：正常成功请求不记日志（避免刷库淹没关键信息），仅记录慢请求与失败请求
const SLOW_API_MS = 1000;

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
      if (duration >= SLOW_API_MS) {
        enqueueLogEvent({
          type: 'frontend',
          traceId,
          payload: {
            level: 'warn',
            category: 'api',
            message: `慢请求 ${(config.method ?? 'GET').toUpperCase()} ${url}`,
            meta: {
              status: response.status,
              duration
            }
          }
        });
      }
    }
    if (payload?.code !== 0) {
      // HTTP 200 但业务码非 0：同样上报日志中心（HTTP 错误分支在上报，这里此前是盲区）
      if (!url.includes(LOG_ENDPOINT)) {
        const headerTraceId = (config?.headers?.['x-trace-id'] as string | undefined) ?? undefined;
        enqueueLogEvent({
          type: 'error',
          traceId: headerTraceId,
          payload: {
            message: `业务失败 ${(config.method ?? 'GET').toUpperCase()} ${url}: ${payload?.message ?? ''}`,
            meta: { code: payload?.code, url }
          }
        });
      }
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
      if (response) {
        enqueueLogEvent({
          type: 'error',
          traceId,
          payload: {
            message: `${(config.method ?? 'GET').toUpperCase()} ${url} -> ${response.status}`,
            stack: typeof response.data?.message === 'string' ? response.data.message : undefined,
            meta: {
              status: response.status,
              url
            }
          }
        });
      } else {
        // 网络层失败（断网/DNS/超时/被拦截）没有响应体，是排查"用户说打不开"的关键信号
        enqueueLogEvent({
          type: 'error',
          traceId: headerTraceId,
          payload: {
            message: `网络错误 ${(config?.method ?? 'GET').toUpperCase()} ${url}`,
            stack: error?.message,
            meta: {
              network: true,
              timeout: Boolean(config?.timeout && error?.code === 'ECONNABORTED'),
              url
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
