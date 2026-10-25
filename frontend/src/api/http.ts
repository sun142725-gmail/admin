// Axios 封装用于统一请求与自动刷新令牌。
import axios from 'axios';
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

export default http;
