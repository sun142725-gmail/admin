// business 层操作列：items={key,label,onClick,danger?,permission?} 组合既有 Permission 组件
// （components/permission/Permission.tsx:11-24 原样复用，mode=disable cloneElement 语义不变）。
// 默认统一 type='link' size='small'（终结 default vs link 分裂，属预期视觉统一，见 README 变更清单），
// variant='default' 兜底还原按钮形态。
import React from 'react';
import { Button, Space } from 'antd';
import { Permission } from '../permission/Permission';

export interface ActionItem<T> {
  key: string;
  label: React.ReactNode;
  onClick: (record: T) => void;
  /** 危险动作（删除等）红字。 */
  danger?: boolean;
  /** 权限码：传入则包 Permission（mode=disable），无则直渲染。 */
  permission?: string;
}

export interface ActionCellProps<T> {
  record: T;
  items: Array<ActionItem<T>>;
  /** 按钮形态：默认 'link'（预期视觉统一），'default' 还原实体按钮。 */
  variant?: 'link' | 'default';
}

export const ActionCell = <T,>({ record, items, variant = 'link' }: ActionCellProps<T>): React.ReactElement => (
  <Space>
    {items.map((item) => {
      const button = (
        <Button
          type={variant === 'link' ? 'link' : 'default'}
          size="small"
          danger={item.danger}
          onClick={() => item.onClick(record)}
        >
          {item.label}
        </Button>
      );
      return item.permission ? (
        <Permission key={item.key} code={item.permission} mode="disable">
          {button}
        </Permission>
      ) : (
        <React.Fragment key={item.key}>{button}</React.Fragment>
      );
    })}
  </Space>
);
