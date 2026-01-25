// Auth API 封装。
import http from './http';

export const login = (payload: { username: string; password: string }) =>
  http.post('/auth/login', payload);

export const refresh = (refreshToken: string) =>
  http.post('/auth/refresh', { refreshToken });

export const profile = () => http.get('/auth/profile');

export const logout = () => http.post('/auth/logout');
