// business 层标题区：title/subtitle/actions 插槽，渲染 page-toolbar/page-toolbar-title/
// page-toolbar-subtitle/page-actions 类（styles/global.css:393-407），与 UsersPage.tsx:202-214 结构等价。
// 收编对象：page-toolbar 类 7 文件、flow-page-header 自绘 flex、Card title+extra、裸 Typography.Title。
// LoginPage 独立布局不强制套用。
import React from 'react';

export interface PageHeaderProps {
  /** 主标题（page-toolbar-title）。 */
  title: React.ReactNode;
  /** 副标题（page-toolbar-subtitle），不传不渲染。 */
  subtitle?: React.ReactNode;
  /** 右侧操作区（page-actions）：新增按钮/搜索位/刷新等。 */
  actions?: React.ReactNode;
  /** 追加到 page-toolbar 的类名。 */
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, className }) => (
  <div className={className ? `page-toolbar ${className}` : 'page-toolbar'}>
    <div>
      <div className="page-toolbar-title">{title}</div>
      {subtitle ? <div className="page-toolbar-subtitle">{subtitle}</div> : null}
    </div>
    {actions ? <div className="page-actions">{actions}</div> : null}
  </div>
);
