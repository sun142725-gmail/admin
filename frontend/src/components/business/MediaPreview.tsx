// business 层媒体预览：合并 flowRunUI.tsx RunOutputsView（按扩展名分流 video/audio/img + JSON 折叠）
// 与 GraphicPage.tsx:299-332 内联写法。仅 antd + 原生标签，禁碰 react-quill/@xyflow/react/echarts 懒加载边界。
// classifyMedia/splitMediaOutputs 纯函数导出供单测；JSON 折叠复用既有 components/JsonView.tsx。
import React from 'react';
import { Collapse } from 'antd';
import { JsonView } from '../JsonView';

const VIDEO_EXT = /\.(mp4|mov|webm|m3u8)(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|flac|m4a)(\?|$)/i;

export type MediaKind = 'video' | 'image' | 'audio';

export interface MediaEntry {
  key: string;
  kind: MediaKind;
  url: string;
}

/** URL → 媒体类型判定（扩展名分流，判定顺序 video→image→audio 与 flowRunUI 原口径一致）。 */
export const classifyMedia = (url: string): MediaKind | null => {
  if (VIDEO_EXT.test(url)) {
    return 'video';
  }
  if (IMAGE_EXT.test(url)) {
    return 'image';
  }
  if (AUDIO_EXT.test(url)) {
    return 'audio';
  }
  return null;
};

/** 站内可预览地址：/uploads 相对路径或 http(s) 外链（flowRunUI.tsx:56 原口径）。 */
export const isPreviewableUrl = (value: string): boolean =>
  value.startsWith('http') || value.startsWith('/uploads/');

/** outputs 记录分流：可预览媒体 → medias，其余键值 → rest（供 JSON 折叠）。 */
export const splitMediaOutputs = (
  outputs?: Record<string, unknown> | null
): { medias: MediaEntry[]; rest: Array<[string, unknown]> } => {
  const medias: MediaEntry[] = [];
  const rest: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(outputs ?? {})) {
    if (typeof value === 'string' && isPreviewableUrl(value)) {
      const kind = classifyMedia(value);
      if (kind) {
        medias.push({ key, kind, url: value });
        continue;
      }
    }
    rest.push([key, value]);
  }
  return { medias, rest };
};

export interface MediaPreviewProps {
  /** 媒体地址（仅 video/audio/image 扩展名渲染，其余返回 null）。 */
  url: string;
  /** 图片 alt（默认用 url）。 */
  alt?: string;
  /** 视频最大高度（默认 420，对齐 GraphicPage 成片卡）。 */
  videoMaxHeight?: number;
  /** 图片宽度 / 音频宽度（默认 280）。 */
  mediaWidth?: number | string;
  className?: string;
}

/** 单 URL 媒体渲染：video controls / audio controls / img。 */
export const MediaPreview: React.FC<MediaPreviewProps> = ({
  url,
  alt,
  videoMaxHeight = 420,
  mediaWidth = 280,
  className
}) => {
  const kind = classifyMedia(url);
  if (!kind) {
    return null;
  }
  if (kind === 'video') {
    return <video src={url} controls preload="metadata" className={className} style={{ width: '100%', maxHeight: videoMaxHeight }} />;
  }
  if (kind === 'audio') {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio src={url} controls preload="metadata" className={className} style={{ width: mediaWidth, height: 32 }} />;
  }
  return <img src={url} alt={alt ?? url} className={className} style={{ width: mediaWidth, borderRadius: 8 }} />;
};

export interface OutputsMediaPreviewProps {
  /** 运行产物键值对：媒体键直接预览，其余键收进 JSON 折叠。 */
  outputs?: Record<string, unknown> | null;
  /** JSON 折叠面板标题（默认「其余字段」）。 */
  jsonTitle?: string;
}

/** outputs 整体渲染（RunOutputsView 升级版）：媒体预览 + JsonView 折叠，无内容返回 null。 */
export const OutputsMediaPreview: React.FC<OutputsMediaPreviewProps> = ({ outputs, jsonTitle = '其余字段' }) => {
  const { medias, rest } = splitMediaOutputs(outputs);
  if (medias.length === 0 && rest.length === 0) {
    return null;
  }
  return (
    <div className="flow-run-outputs">
      {medias.map((media) => (
        <MediaPreview key={media.key} url={media.url} alt={media.key} />
      ))}
      {rest.length > 0 ? (
        <Collapse
          size="small"
          items={[
            {
              key: 'rest-json',
              label: jsonTitle,
              children: <JsonView value={Object.fromEntries(rest)} />
            }
          ]}
        />
      ) : null}
    </div>
  );
};
