// 日志中心 API 封装。
import http from './http';

export const listAuditLogs = (params: {
  page?: number;
  pageSize?: number;
  userId?: number;
  module?: string;
  start?: string;
  end?: string;
}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  });
  return http.get(`/audit-center?${query.toString()}`);
};

export const getAuditLogDetail = (id: number) => http.get(`/audit-center/${id}`);
