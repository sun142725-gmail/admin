// 运行态共享 UI：状态标签配色、耗时格式化、产物媒体预览（编辑器控制台与运行历史抽屉共用）。
import React from 'react';

export const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '排队中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  succeeded: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
  skipped: { label: '已跳过', color: 'default' },
  reused: { label: '复用上次', color: 'purple' }
};

export const NODE_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待执行', color: 'default' },
  running: { label: '执行中', color: 'processing' },
  succeeded: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '取消', color: 'warning' },
  skipped: { label: '跳过', color: 'default' },
  reused: { label: '复用', color: 'purple' }
};

export const RUN_MODE_META: Record<string, { label: string; color: string }> = {
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

const VIDEO_EXT = /\.(mp4|mov|webm|m3u8)(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i;

/** 产物渲染：视频/图片直接预览，其余 JSON 折叠展示。 */
export const RunOutputsView: React.FC<{ outputs?: Record<string, unknown> | null }> = ({ outputs }) => {
  if (!outputs || Object.keys(outputs).length === 0) {
    return null;
  }
  const medias: Array<{ key: string; kind: 'video' | 'image'; url: string }> = [];
  const rest: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(outputs)) {
    if (typeof value === 'string' && value.startsWith('http')) {
      if (VIDEO_EXT.test(value)) {
        medias.push({ key, kind: 'video', url: value });
        continue;
      }
      if (IMAGE_EXT.test(value)) {
        medias.push({ key, kind: 'image', url: value });
        continue;
      }
    }
    rest.push([key, value]);
  }
  return (
    <div className="flow-run-outputs">
      {medias.map((media) =>
        media.kind === 'video' ? (
          <video key={media.key} src={media.url} controls preload="metadata" />
        ) : (
          <img key={media.key} src={media.url} alt={media.key} />
        )
      )}
      {rest.length > 0 && (
        <pre
          style={{
            margin: 0,
            padding: 8,
            background: 'var(--app-bg)',
            borderRadius: 8,
            fontSize: 12,
            maxWidth: '100%',
            overflow: 'auto'
          }}
        >
          {JSON.stringify(Object.fromEntries(rest), null, 2)}
        </pre>
      )}
    </div>
  );
};
