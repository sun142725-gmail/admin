// 画布便签节点：点击进入编辑态（TextArea），失焦保存；预设 4 色便签底色。
// data 契约（详见 ../README.md）：text/color 为可序列化纯数据；
// onChange/onDelete 为页面注入的运行时字段，不落快照，恢复时由页面按 type 重建。
import React, { useState } from 'react';
import { Button, Input } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { Node, NodeProps } from '@xyflow/react';
import { ConfirmPopconfirm } from '../../business/ConfirmAction';

export interface NoteNodeData extends Record<string, unknown> {
  /** 便签正文。 */
  text: string;
  /** 便签底色（取 NOTE_COLORS 之一，非法值回退首色）。 */
  color?: string;
  /** 运行时注入：正文变更回调（页面更新节点 data），不落快照。 */
  onChange?: (text: string) => void;
  /** 运行时注入：删除确认后回调（页面移除节点），不传不渲染删除按钮。 */
  onDelete?: () => void;
}

export type NoteCanvasNode = Node<NoteNodeData, 'note'>;

/** 预设便签色（低饱和荧光色系，暗色背景下也可读）。 */
export const NOTE_COLORS = ['#fff7b8', '#d3f261', '#a7d8f0', '#ffd6e7'] as const;

/** 便签正文长度上限：快照体积控制口径（1.5s 防抖自动保存，正文不该写长文）。 */
const NOTE_MAX_LENGTH = 500;

const NOTE_WIDTH = 200;

export const NoteNode: React.FC<NodeProps<NoteCanvasNode>> = ({ data }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text);
  const color = (NOTE_COLORS as readonly string[]).includes(data.color ?? '') ? data.color! : NOTE_COLORS[0];

  return (
    <div
      className="relative rounded-lg px-3 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.1)]"
      style={{ width: NOTE_WIDTH, backgroundColor: color }}
    >
      {editing ? (
        <Input.TextArea
          autoFocus
          value={draft}
          maxLength={NOTE_MAX_LENGTH}
          autoSize={{ minRows: 3, maxRows: 10 }}
          className="nodrag nowheel bg-transparent"
          variant="borderless"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            setEditing(false);
            data.onChange?.(draft);
          }}
          onPressEnter={(event) => {
            // Enter 换行由 TextArea 天然支持；Ctrl/Cmd+Enter 提交保存（失焦等价）。
            if (event.ctrlKey || event.metaKey) {
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <div
          className="nodrag min-h-[60px] cursor-text whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-700"
          onClick={() => {
            setDraft(data.text);
            setEditing(true);
          }}
        >
          {data.text || <span className="text-slate-400">点击输入便签内容…</span>}
        </div>
      )}

      {data.onDelete ? (
        <ConfirmPopconfirm title="删除该便签？" onConfirm={data.onDelete}>
          <Button
            size="small"
            shape="circle"
            icon={<DeleteOutlined />}
            className="nodrag !absolute -right-2 -top-2 z-10 !border-slate-200 bg-white/90"
          />
        </ConfirmPopconfirm>
      ) : null}
    </div>
  );
};
