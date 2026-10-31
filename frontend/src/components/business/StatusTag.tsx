// business 层状态标签：<StatusTag value map fallback?>，收编 flowRunUI/GraphicPage/AuditCenterPage
// 等散落映射表（<Tag color={meta.color}>{meta.label}</Tag> 统一形态，色板走 antd 预设词）。
// resolveStatusMeta 纯函数导出供单测；语义色映射表见 components/README.md「状态色刻度表」。
import React from 'react';
import { Tag } from 'antd';
import type { StatusMeta } from '../../types/ui';

/** 取值解析：map 命中返回 meta；未命中回退 fallback；value 为空未命中返回 undefined。 */
export const resolveStatusMeta = (
  value: string | number | null | undefined,
  map: Record<string | number, StatusMeta>,
  fallback?: StatusMeta
): StatusMeta | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return map[value] ?? fallback;
};

export interface StatusTagProps {
  value: string | number | null | undefined;
  map: Record<string | number, StatusMeta>;
  /** map 未命中时的兜底 meta（如 RunPanel.tsx:36 的 {label: 原值, color: 'default'} 模式）。 */
  fallback?: StatusMeta;
}

export const StatusTag: React.FC<StatusTagProps> = ({ value, map, fallback }) => {
  const meta = resolveStatusMeta(value, map, fallback);
  if (!meta) {
    // 无匹配且无兜底：退化为原值无色 Tag（对齐 FlowRunsPage.tsx:294-295 的 ?? 原值行为），空值不渲染
    return value === null || value === undefined || value === '' ? null : <Tag>{value}</Tag>;
  }
  return <Tag color={meta.color}>{meta.label}</Tag>;
};
