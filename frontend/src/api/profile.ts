// 个人中心 API 封装。
import http from './http';

export const getProfile = () => http.get('/profile');
export const updateProfile = (payload: { nickname?: string; email?: string; avatarUrl?: string }) =>
  http.patch('/profile', payload);
export const updatePassword = (payload: { oldPassword: string; newPassword: string }) =>
  http.post('/profile/password', payload);
export const uploadAvatar = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return http.post('/profile/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
