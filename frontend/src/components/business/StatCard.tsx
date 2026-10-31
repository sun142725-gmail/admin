// business 层统计卡：antd Statistic 版归一（收编 HomePage 三卡与 OverviewPanel/RolePermissionsPage 散写）。
// children/extra 插槽：HomePage.tsx:120-135 三卡为 Statistic+Progress 纵排，title/value/suffix 放不下，
// children 承载 Progress；extra 走 Card extra 位；tip 为底部辅助说明行。
import React from 'react';
import { Card, Statistic, Typography } from 'antd';
import type { StatisticProps } from 'antd';

export interface StatCardProps {
  title: React.ReactNode;
  value?: StatisticProps['value'];
  precision?: number;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** 数值加载骨架。 */
  loading?: boolean;
  /** 底部辅助说明（次级文字行）。 */
  tip?: React.ReactNode;
  /** Card 右上角操作位。 */
  extra?: React.ReactNode;
  /** Statistic 下方附加内容（如 Progress 纵排），间距由调用方控制（对齐现状 mt-3 用法）。 */
  children?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  precision,
  prefix,
  suffix,
  loading,
  tip,
  extra,
  children,
  className
}) => (
  <Card bordered={false} className={className} extra={extra}>
    <Statistic title={title} value={value} precision={precision} prefix={prefix} suffix={suffix} loading={loading} />
    {tip !== undefined && tip !== null ? (
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
        {tip}
      </Typography.Text>
    ) : null}
    {children}
  </Card>
);
