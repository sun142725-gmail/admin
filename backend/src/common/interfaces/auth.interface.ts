// 鉴权相关接口定义用于类型约束。
export interface AuthPayload {
  sub: number;
  username: string;
  tokenVersion: number;
  permissions: string[];
  roles: string[];
  typ: string;
}

export interface RequestUser {
  id: number;
  username: string;
  permissions: string[];
  roles: string[];
}
