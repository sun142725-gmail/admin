// 资源 API 封装。
import http from './http';

export const fetchMenuTree = () => http.get('/resources/tree');
