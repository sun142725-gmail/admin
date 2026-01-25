// 权限装饰器用于标记接口所需权限码。
import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../constants';

export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
