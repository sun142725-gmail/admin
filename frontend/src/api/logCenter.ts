// 日志中心接口封装用于批量上报与查询。
import http from './http';

export type LogEventType = 'track' | 'frontend' | 'error';

// 日志条目：四类日志（审计/打点/前端/错误）字段并集，列表与详情共用
export interface LogItem {
  id: number;
  userId?: number;
  module?: string;
  action?: string;
  detail?: string;
  ip?: string;
  createdAt: string;
  traceId?: string;
  sessionId?: string;
  source?: string;
  pageCode?: string;
  path?: string;
  level?: string;
  category?: string;
  message?: string;
  stack?: string;
  meta?: Record<string, unknown>;
  userAgent?: string;
  referrer?: string;
}

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

// 链路聚合结果：同一 traceId 下三类日志按时间正序返回
export interface TraceResult {
  traceId: string;
  track: Record<string, unknown>[];
  frontend: Record<string, unknown>[];
  error: Record<string, unknown>[];
}

export const getLogTrace = (traceId: string) => {
  return http.get<never, TraceResult>(`/log-center/trace/${traceId}`);
};

// 概览统计：三类日志趋势 + Top 聚合（服务端会把 days 收敛到保留期内）
export interface LogStats {
  days: number;
  start: string;
  errorTrend: Array<{ day: string; count: number }>;
  pvTrend: Array<{ day: string; count: number }>;
  frontendTrend: Array<{ day: string; count: number }>;
  topErrors: Array<{ message: string; count: number; firstSeen: string; lastSeen: string }>;
  topSlowRequests: Array<{ message: string; count: number; lastSeen: string }>;
  topPages: Array<{ pageCode: string; count: number }>;
  errorBySource: Array<{ source: string | null; count: number }>;
}

export const getLogStats = (days: number) => {
  return http.get<never, LogStats>('/log-center/stats', { params: { days } });
};

export const getSessionTrace = (sessionId: string, params: { source?: string; days?: number }) => {
  return http.get<never, TraceResult & { days: number }>(`/log-center/session/${sessionId}`, { params });
};
