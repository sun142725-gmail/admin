// base 层统一表格：收编原 components/AppTable.tsx（视觉与行为零变化），补泛型签名与 locale 透传。
// 默认分页语义：{defaults, ...props.pagination} 合并，外部字段覆盖默认；pagination={false} 保持关闭。
// ⚠条件分页迁移站点（stock 三页）不传 showSizeChanger：默认 true 与 rc-pagination total>50 默认一致，
//   pageSizeOptions 由调用方显式 ['10','20','50','100'] 对齐 rc-pagination 原生默认（components/README.md）。
import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

export type SelfTableProps<T extends object> = TableProps<T>;

type TablePagination = TableProps<Record<string, unknown>>['pagination'];

/**
 * 分页合并纯函数：默认值在前、外部 pagination 字段覆盖默认（受控 current/pageSize/total/onChange 全量透传）。
 * pagination={false} 保持关闭（返回 false）。
 */
export const buildMergedPagination = (pagination: TablePagination): TablePagination => {
  if (pagination === false) {
    return false;
  }
  return {
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '30', '50'],
    showTotal: (total: number) => `共 ${total} 条`,
    locale: { items_per_page: '页' },
    ...(pagination ?? {})
  };
};

export const SelfTable = <T extends object>(props: SelfTableProps<T>): React.ReactElement => {
  const { pagination, size, scroll, ...rest } = props;
  // 泛型入参以结构兼容方式传给纯函数（字段子集合并语义与具体行类型无关）
  const mergedPagination = buildMergedPagination(pagination as TablePagination);

  return (
    <Table<T>
      size={size ?? 'middle'}
      scroll={scroll ?? { x: 'max-content' }}
      {...rest}
      pagination={mergedPagination}
    />
  );
};
