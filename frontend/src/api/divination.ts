// 占卜 API 封装。
import http from './http';

export const createDivination = (topic: string) => http.post('/divinations', { topic });
export const getDivination = (id: number) => http.get(`/divinations/${id}`);
