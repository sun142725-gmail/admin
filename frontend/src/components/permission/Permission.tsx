// 权限组件用于控制按钮显示与禁用状态。
import React from 'react';
import { useAppSelector } from '../../store/hooks';

interface PermissionProps {
  code: string;
  mode?: 'hide' | 'disable';
  children: React.ReactElement;
}

export const Permission: React.FC<PermissionProps> = ({ code, mode = 'hide', children }) => {
  const permissions = useAppSelector((state) => state.auth.profile?.permissions ?? []);
  const hasPermission = permissions.includes(code);

  if (hasPermission) {
    return children;
  }

  if (mode === 'disable') {
    return React.cloneElement(children, { disabled: true });
  }

  return null;
};
