// business 层内容容器：page-table-card（styles/global.css:422）div 包裹，收编 7 文件手写样板。
// ⚠表格空态不在此处理：一律走 SelfTable 的 Table locale.emptyText 透传（两者不得叠加）；
// EmptyState 仅服务非表格空态（详情/页面级），description 必须透传开放。
import React from 'react';
import { Empty } from 'antd';
import type { EmptyProps } from 'antd';

export interface PagePanelProps {
  children: React.ReactNode;
  /** 追加到 page-table-card 的类名。 */
  className?: string;
}

export const PagePanel: React.FC<PagePanelProps> = ({ children, className }) => (
  <div className={className ? `page-table-card ${className}` : 'page-table-card'}>{children}</div>
);

export interface EmptyStateProps {
  /** 空态文案：必须开放透传（详情/页面级定制文案），默认「暂无数据」仅用于无定制文案处。 */
  description?: React.ReactNode;
  /** antd Empty image 透传（Empty.PRESENTED_IMAGE_SIMPLE 等）。 */
  image?: EmptyProps['image'];
  /** 追加类名。 */
  className?: string;
  /** 撑满父级剩余高度（父级需为 flex 容器，页面根加 page-fill 激活壳链）：
   *  空态居中铺满剩余界面，用于「未查询/无结果」等整片留白场景；缺省保持自然高度形态。 */
  fill?: boolean;
}

/** 非表格空态统一形态：居中 Empty 容器。表格空态走 Table locale.emptyText，不与本组件叠加。 */
export const EmptyState: React.FC<EmptyStateProps> = ({ description = '暂无数据', image, className, fill = false }) =>
  fill ? (
    <div className={`flex-1 min-h-0 flex flex-col items-center justify-center ${className ?? ''}`}>
      <Empty image={image} description={description} />
    </div>
  ) : (
    <div className={className} style={{ padding: '48px 0', textAlign: 'center' }}>
      <Empty image={image} description={description} />
    </div>
  );
