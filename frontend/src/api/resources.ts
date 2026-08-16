// 资源 API 封装。
import http from './http';

export interface MenuTreeNode {
  id: number;
  name: string;
  path?: string;
  permissionCode?: string;
  children?: MenuTreeNode[];
}

export const fetchMenuTree = () => http.get<never, MenuTreeNode[]>('/resources/tree');
