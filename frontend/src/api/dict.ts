// 字典管理接口封装。
import http from './http';

export const listDicts = (params: { page?: number; pageSize?: number; keyword?: string; status?: number }) =>
  http.get('/dicts', { params });

export const getDictDetail = (code: string) => http.get(`/dicts/${code}`);

export const createDict = (payload: { code: string; name: string; description?: string; status?: number }) =>
  http.post('/dicts', payload);

export const updateDict = (id: number, payload: { name?: string; description?: string; status?: number }) =>
  http.patch(`/dicts/${id}`, payload);

export const deleteDict = (id: number) => http.delete(`/dicts/${id}`);

export const createDictItem = (
  dictId: number,
  payload: {
    value: string;
    label: string;
    labelI18n?: Record<string, string>;
    sortOrder?: number;
    status?: number;
    extra?: Record<string, unknown>;
  }
) => http.post(`/dicts/${dictId}/items`, payload);

export const updateDictItem = (
  itemId: number,
  payload: {
    value?: string;
    label?: string;
    labelI18n?: Record<string, string>;
    sortOrder?: number;
    status?: number;
    extra?: Record<string, unknown>;
  }
) => http.patch(`/dict-items/${itemId}`, payload);

export const deleteDictItem = (itemId: number) => http.delete(`/dict-items/${itemId}`);

export const batchDicts = (params: { codes: string; lang?: string }) =>
  http.get('/dicts/batch', { params });
