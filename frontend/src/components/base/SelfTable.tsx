// base 层统一表格：收编原 components/AppTable.tsx（视觉与行为零变化），补泛型签名与 locale 透传。
// 默认分页语义：{defaults, ...props.pagination} 合并，外部字段覆盖默认；pagination={false} 保持关闭。
// ⚠条件分页迁移站点（stock 三页）不传 showSizeChanger：默认 true 与 rc-pagination total>50 默认一致，
//   pageSizeOptions 由调用方显式 ['10','20','50','100'] 对齐 rc-pagination 原生默认（components/README.md）。
// fill（opt-in）：true 时包一层 flex-1 min-h-0 测量容器，按 useFillTableHeight 口径注入 scroll.y（表体内部滚动、分页常驻）；
//   fill 缺省走原有渲染路径零改动，mergeFillScroll 保证未测量首帧与非 fill 渲染等价。
import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import { useFillTableHeight } from '../../hooks/useFillTableHeight';

export type SelfTableProps<T extends object> = TableProps<T> & { fill?: boolean };

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

/**
 * fill 模式 scroll 合并纯函数：fillY==null（未测量）返回 scroll ?? { x: 'max-content' }——
 * 与非 fill 现状逐字节等价（首帧无列宽重排跳变）；fillY!=null 时 y 以 fill 计算值为准、x 保留调用方自带值。
 */
export const mergeFillScroll = <T extends object>(
  scroll: TableProps<T>['scroll'] | undefined,
  fillY: number | undefined | null
): TableProps<T>['scroll'] => {
  if (fillY == null) {
    return scroll ?? { x: 'max-content' };
  }
  return { ...(scroll ?? { x: 'max-content' }), y: fillY };
};

export const SelfTable = <T extends object>(props: SelfTableProps<T>): React.ReactElement => {
  const { pagination, size, scroll, fill, ...rest } = props;
  // 泛型入参以结构兼容方式传给纯函数（字段子集合并语义与具体行类型无关）
  const mergedPagination = buildMergedPagination(pagination as TablePagination);
  const { containerRef, fillScrollY } = useFillTableHeight<HTMLDivElement>();

  if (fill) {
    return (
      <div ref={containerRef} className="flex-1 min-h-0">
        <Table<T>
          size={size ?? 'middle'}
          scroll={mergeFillScroll<T>(scroll, fillScrollY)}
          {...rest}
          pagination={mergedPagination}
        />
      </div>
    );
  }

  return (
    <Table<T>
      size={size ?? 'middle'}
      scroll={scroll ?? { x: 'max-content' }}
      {...rest}
      pagination={mergedPagination}
    />
  );
};
