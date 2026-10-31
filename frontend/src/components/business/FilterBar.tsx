// business 层筛选栏：page-filter-card（styles/global.css:409）+ Form layout='inline' + 查询/重置默认按钮组。
// 结构与 pages/dict/DictPage.tsx:280-294 现状等价。
// ⚠audit 特例：hideDefaultActions 关闭默认组 + formClassName 透传
// （AuditCenterPage.tsx:910 Form className='flex flex-wrap gap-4'，:956-989 多按钮与 ColumnSettings
// 同处一个全宽居中 Form.Item，不支持即迁移即变布局）；actions 插槽承载额外按钮。
// 故意不设 Form onFinish：现状查询由按钮 onClick 触发，避免给既有页面新增「回车提交」行为。
import React from 'react';
import { Button, Form, Space } from 'antd';
import type { FormInstance } from 'antd';

export interface FilterBarProps<T extends object> {
  form: FormInstance<T>;
  /** 筛选控件（Form.Item 们）。 */
  children: React.ReactNode;
  /** 查询回调（主按钮 onClick）。 */
  onSearch?: () => void;
  /** 重置回调（次按钮 onClick，页面自行 form.resetFields + 复位分页）。 */
  onReset?: () => void;
  /** 查询中 loading。 */
  searchLoading?: boolean;
  /** 关闭默认查询/重置按钮组（audit 特例，按钮组走 actions 插槽自组）。 */
  hideDefaultActions?: boolean;
  /** 追加到 Form 的类名（audit 特例透传 'flex flex-wrap gap-4'）。 */
  formClassName?: string;
  /** 额外操作区：刷新/导出/列设置等，渲染在默认按钮组之后。 */
  actions?: React.ReactNode;
  /** 查询按钮文案（默认「查询」）。 */
  searchText?: string;
  /** 重置按钮文案（默认「重置」）。 */
  resetText?: string;
  /** 追加到 page-filter-card 的类名。 */
  className?: string;
}

export const FilterBar = <T extends object = Record<string, unknown>>({
  form,
  children,
  onSearch,
  onReset,
  searchLoading,
  hideDefaultActions,
  formClassName,
  actions,
  searchText = '查询',
  resetText = '重置',
  className
}: FilterBarProps<T>): React.ReactElement => (
  <div className={className ? `page-filter-card ${className}` : 'page-filter-card'}>
    <Form layout="inline" form={form} className={formClassName}>
      {children}
      {!hideDefaultActions && (onSearch || onReset) ? (
        <Form.Item>
          <Space>
            {onSearch ? (
              <Button type="primary" loading={searchLoading} onClick={onSearch}>
                {searchText}
              </Button>
            ) : null}
            {onReset ? <Button onClick={onReset}>{resetText}</Button> : null}
          </Space>
        </Form.Item>
      ) : null}
      {actions}
    </Form>
  </div>
);
