// 公共文件上传 API（后端 POST /api/files/upload）。
// 返回 url 为 '/uploads/<bizType>/<file>' 完整静态路径（vite 已代理 /uploads），可直接存
// coverUrl / 角色参考图。bizType 用既有白名单 'common'（files.controller.ts BIZ_TYPES），不扩目录。
import http from './http';

export interface UploadedFileVo {
  id: number;
  url: string;
}

export const uploadFile = (file: File, bizType = 'common') => {
  const form = new FormData();
  form.append('file', file);
  form.append('bizType', bizType);
  return http.post<never, UploadedFileVo>('/files/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

// BGM 音频独立端点（POST /api/files/upload-audio）：.mp3/.wav、≤10MB，落 uploads/novel-bgm/。
export const uploadAudioFile = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return http.post<never, UploadedFileVo>('/files/upload-audio', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
