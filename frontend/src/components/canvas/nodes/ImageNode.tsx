// 画布图片节点：骨架（loading）→ 预览图（antd Image，原生懒加载 + 点击大图）→ 失败重试。
// data 契约（详见 ../README.md）：url/width/height/prompt/size 为可序列化纯数据；
// onDelete/footer 为页面注入的运行时字段，不落快照，恢复时由页面按 type 重建。
import React, { useEffect, useState } from 'react';
import { Button, Image as AntImage, Skeleton } from 'antd';
import { DeleteOutlined, RedoOutlined } from '@ant-design/icons';
import type { Node, NodeProps } from '@xyflow/react';
import { ConfirmPopconfirm } from '../../business/ConfirmAction';

export interface ImageNodeData extends Record<string, unknown> {
  /** 图片地址（/uploads 短路径或 data URL）。 */
  url: string;
  /** 生成中骨架态（快照不保留该形态，恢复时无 url 的 loading 残留节点被丢弃）。 */
  loading?: boolean;
  /** 渲染宽（默认 240，生成成功时由 imageSizeToNode 预置）。 */
  width?: number;
  /** 渲染高（与 width 配对的等比高度）。 */
  height?: number;
  /** 生成该图的提示词（tooltip 展示）。 */
  prompt?: string;
  /** 生成尺寸（如 1024x1024，tooltip 展示）。 */
  size?: string;
  /** 运行时注入：删除确认后回调（页面移除节点），不传不渲染删除按钮。 */
  onDelete?: () => void;
  /** 运行时注入：底部动作插槽（页面放「以此图续画」），不落快照。 */
  footer?: React.ReactNode;
}

export type ImageCanvasNode = Node<ImageNodeData, 'image'>;

/** 默认渲染宽（与 canvas.helpers.IMAGE_NODE_WIDTH 一致的量级）。 */
const NODE_WIDTH = 240;
/** 无预置宽高时的兜底比例（高/宽 = 3/4，接近常见方图视觉）。 */
const FALLBACK_RATIO = 4 / 3;

export const ImageNode: React.FC<NodeProps<ImageCanvasNode>> = ({ data }) => {
  const width = typeof data.width === 'number' && data.width > 0 ? data.width : NODE_WIDTH;
  const height =
    typeof data.height === 'number' && data.height > 0 ? Math.round(data.height) : Math.round(width / FALLBACK_RATIO);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // url 变化（生成回填/快照恢复）清除历史错误态。
  useEffect(() => {
    setError(false);
  }, [data.url]);

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)]">
      {data.loading ? (
        <div style={{ width, height }} className="flex items-center justify-center rounded-lg bg-slate-50 p-2">
          <Skeleton.Node active style={{ width: width - 16, height: height - 16 }} />
        </div>
      ) : error ? (
        <div
          style={{ width, height }}
          className="flex flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400"
        >
          <span className="text-xs">图片加载失败</span>
          <Button
            size="small"
            icon={<RedoOutlined />}
            className="nodrag"
            onClick={() => {
              setError(false);
              setReloadKey((key) => key + 1);
            }}
          >
            重试
          </Button>
        </div>
      ) : (
        <AntImage
          key={reloadKey}
          src={data.url}
          width={width}
          height={height}
          // 大图节点懒加载：视口外的节点不立即拉取图片（浏览器原生 lazy）。
          loading="lazy"
          onError={() => setError(true)}
          className="rounded-lg object-cover"
          style={{ width, height, objectFit: 'cover', borderRadius: 12 }}
        />
      )}

      {data.onDelete ? (
        <ConfirmPopconfirm title="删除该图片？" onConfirm={data.onDelete}>
          <Button
            size="small"
            shape="circle"
            icon={<DeleteOutlined />}
            className="nodrag !absolute right-1.5 top-1.5 z-10 !border-slate-200 bg-white/90"
          />
        </ConfirmPopconfirm>
      ) : null}

      {data.footer ? <div className="nodrag border-t border-slate-100 px-2 py-1.5">{data.footer}</div> : null}
    </div>
  );
};
