// Axios 封装用于统一请求与自动刷新令牌。
import axios from 'axios';
import { store } from '../store';
import { clearTokens, setTokens } from '../store/authSlice';
import { enqueueLogEvent } from '../utils/logBatcher';
import { uuid } from '../utils/uuid';

const CLIENT_SOURCE = 'web';
const LOG_ENDPOINT = '/log-center/events';

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
    const traceId = payload?.traceId as string | undefined;
    const config = response.config;
    const url = config?.url ?? '';
    if (!url.includes(LOG_ENDPOINT)) {
      const duration = Date.now() - ((config as any).metadata?.startTime ?? Date.now());
      enqueueLogEvent({
        type: 'frontend',
        traceId,
        payload: {
          level: 'info',
          category: 'api',
          message: `${(config.method ?? 'GET').toUpperCase()} ${url}`,
          meta: {
            status: response.status,
            duration
          }
        }
      });
    }
    if (payload?.code !== 0) {
      return Promise.reject(new Error(payload?.message ?? '请求失败'));
    }
    return payload.data;
  },
  async (error) => {
    const { response, config } = error;
    const url = config?.url ?? '';
    if (response?.data && !url.includes(LOG_ENDPOINT)) {
      const traceId = response.data?.traceId as string | undefined;
      enqueueLogEvent({
        type: 'error',
        traceId,
        payload: {
          message: response.data?.message ?? '请求失败',
          meta: {
            status: response.status,
            url
          }
        }
      });
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
