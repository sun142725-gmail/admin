// 权限 API 封装。
import http from './http';

export const listPermissions = (page = 1, pageSize = 20) =>
  http.get(`/permissions?page=${page}&pageSize=${pageSize}`);
export const createPermission = (payload: any) => http.post('/permissions', payload);
export const updatePermission = (id: number, payload: any) =>
  http.patch(`/permissions/${id}`, payload);
export const deletePermission = (id: number) => http.delete(`/permissions/${id}`);
