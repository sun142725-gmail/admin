// 日志中心接口封装用于批量上报与查询。
import http from './http';

export type LogEventType = 'track' | 'frontend' | 'error';

export interface LogEvent {
  type: LogEventType;
  payload: Record<string, unknown>;
  traceId?: string;
  createdAt?: string;
}

export const postLogEvents = (payload: {
  source?: string;
  sessionId?: string;
  events: LogEvent[];
}) => {
  return http.post('/log-center/events', payload);
};

export const listLogCenter = (params: Record<string, unknown>) => {
  return http.get('/log-center', { params });
};

export const getLogCenterDetail = (type: LogEventType, id: number) => {
  return http.get(`/log-center/${type}/${id}`);
};
