// 用户 API 封装。
import http from './http';

export const listUsers = (page = 1, pageSize = 20) =>
  http.get(`/users?page=${page}&pageSize=${pageSize}`);

export const createUser = (payload: any) => http.post('/users', payload);
export const updateUser = (id: number, payload: any) => http.patch(`/users/${id}`, payload);
export const disableUser = (id: number) => http.patch(`/users/${id}/disable`);
export const deleteUser = (id: number) => http.delete(`/users/${id}`);
export const resetPassword = (id: number, payload: { password: string }) =>
  http.post(`/users/${id}/reset-password`, payload);
export const assignRoles = (id: number, roleIds: number[]) =>
  http.post(`/users/${id}/roles`, { roleIds });
