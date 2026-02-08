// 通知管理 API 封装。
import http from './http';

export const listNotificationTemplates = (params?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
}) => {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize) search.set('pageSize', String(params.pageSize));
  if (params?.keyword) search.set('keyword', params.keyword);
  if (params?.status !== undefined) search.set('status', String(params.status));
  const query = search.toString();
  return http.get(`/notifications/templates${query ? `?${query}` : ''}`);
};

export const createNotificationTemplate = (payload: any) =>
  http.post('/notifications/templates', payload);

export const updateNotificationTemplate = (id: number, payload: any) =>
  http.patch(`/notifications/templates/${id}`, payload);

export const deleteNotificationTemplate = (id: number) =>
  http.delete(`/notifications/templates/${id}`);

export const listNotificationPublishes = (params?: {
  page?: number;
  pageSize?: number;
  channelType?: string;
  status?: string;
  templateId?: number;
  keyword?: string;
}) => {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize) search.set('pageSize', String(params.pageSize));
  if (params?.channelType) search.set('channelType', params.channelType);
  if (params?.status) search.set('status', params.status);
  if (params?.templateId) search.set('templateId', String(params.templateId));
  if (params?.keyword) search.set('keyword', params.keyword);
  const query = search.toString();
  return http.get(`/notifications/publish${query ? `?${query}` : ''}`);
};

export const publishNotification = (payload: any) => http.post('/notifications/publish', payload);

export const retryNotificationPublish = (id: number, reason?: string) =>
  http.post(`/notifications/publish/${id}/retry`, { reason });

export const getNotificationPublishDetail = (id: number) => http.get(`/notifications/publish/${id}`);

export const listNotificationInbox = (params?: {
  page?: number;
  pageSize?: number;
  status?: 'unread' | 'read';
  keyword?: string;
}) => {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize) search.set('pageSize', String(params.pageSize));
  if (params?.status) search.set('status', params.status);
  if (params?.keyword) search.set('keyword', params.keyword);
  const query = search.toString();
  return http.get(`/notifications/inbox${query ? `?${query}` : ''}`);
};

export const readNotificationInbox = (id: number) => http.patch(`/notifications/inbox/${id}/read`);

export const readAllNotificationInbox = () => http.patch('/notifications/inbox/read-all');
