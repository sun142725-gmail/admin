// 运行态共享 UI：状态标签配色、耗时格式化（编辑器控制台与运行历史抽屉共用）。
// 产物预览 RunOutputsView 已升级为 business 层 OutputsMediaPreview（媒体直渲 + JSON Collapse 折叠，
// 原裸 pre 直出为预期视觉变更），此处一行 re-export 保持组内消费方 import 零改动。
import React from 'react';
import type { StatusMeta } from '../../types/ui';
import { OutputsMediaPreview as RunOutputsViewImpl } from '../../components/business/MediaPreview';

export const RUN_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '排队中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  succeeded: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
  skipped: { label: '已跳过', color: 'default' },
  reused: { label: '复用上次', color: 'purple' }
};

export const NODE_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '待执行', color: 'default' },
  running: { label: '执行中', color: 'processing' },
  succeeded: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '取消', color: 'warning' },
  skipped: { label: '跳过', color: 'default' },
  reused: { label: '复用', color: 'purple' }
};

export const RUN_MODE_META: Record<string, StatusMeta> = {
  run: { label: '完整运行', color: 'blue' },
  single: { label: '试运行', color: 'purple' }
};

export const formatDuration = (ms?: number | null): string => {
  if (!ms && ms !== 0) {
    return '-';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
};

/** 产物渲染（RunOutputsView 升级版）：媒体直渲 + 其余键收进 JSON 折叠。
 *  升级自原裸 pre 直出（预期视觉变更，README 备案）；媒体元素尺寸统一为 MediaPreview 内联值
 *  （video 100%/maxHeight 420、audio 280×32、img 280 宽），与原无约束形态不同，窄屏由 editor.css
 *  .flow-run-outputs 约束兜底。 */
export const RunOutputsView: React.FC<{ outputs?: Record<string, unknown> | null }> = ({ outputs }) => (
  <RunOutputsViewImpl outputs={outputs} />
);
