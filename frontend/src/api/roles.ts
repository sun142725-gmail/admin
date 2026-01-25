// 角色 API 封装。
import http from './http';

export const listRoles = (page = 1, pageSize = 20) =>
  http.get(`/roles?page=${page}&pageSize=${pageSize}`);
export const createRole = (payload: any) => http.post('/roles', payload);
export const updateRole = (id: number, payload: any) => http.patch(`/roles/${id}`, payload);
export const deleteRole = (id: number) => http.delete(`/roles/${id}`);
export const assignPermissions = (id: number, permissionIds: number[]) =>
  http.post(`/roles/${id}/permissions`, { permissionIds });
export const roleUsers = (id: number) => http.get(`/roles/${id}/users`);
