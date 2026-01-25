// 公共表格组件统一分页体验。
import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

export const AppTable = <T extends object>(props: TableProps<T>) => {
  const pagination =
    props.pagination === false
      ? false
      : {
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '30', '50'],
          showTotal: (total: number) => `共 ${total} 条`,
          locale: { items_per_page: '页' },
          ...props.pagination
        };

  return <Table {...props} pagination={pagination} />;
};
