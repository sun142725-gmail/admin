// 画布节点卡片：统一 flow 一种展示组件，按 flowType 取图标/配色，运行时叠加状态角标。
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  MinusOutlined,
  RetweetOutlined
} from '@ant-design/icons';
import type { FlowNodeData } from '../../../api/flows';
import { nodeMetaByKey } from './nodeMeta';

export type FlowCanvasNode = Node<FlowNodeData, 'flow'>;

const STATUS_ICON: Record<string, React.ReactNode> = {
  running: <LoadingOutlined spin />,
  succeeded: <CheckOutlined />,
  failed: <CloseOutlined />,
  reused: <RetweetOutlined />,
  cancelled: <MinusOutlined />
};

/** 卡片摘要行：每种类型挑最有信息量的一段配置展示。 */
const summarize = (flowType: string, config: Record<string, unknown> | undefined): string => {
  if (!config) {
    return '';
  }
  switch (flowType) {
    case 'start': {
      const variables = (config.variables as Array<{ name?: string }> | undefined) ?? [];
      return variables.map((item) => item.name).filter(Boolean).join('、');
    }
    case 'llm':
    case 'image':
      return typeof config.prompt === 'string' ? config.prompt : '';
    case 'video': {
      const prompt = typeof config.prompt === 'string' ? config.prompt : '';
      return config.firstFrame ? `${prompt}（图生视频）` : prompt;
    }
    case 'http':
      return `${String(config.method ?? 'GET')} ${String(config.url ?? '')}`;
    case 'delay':
      return `等待 ${String(config.seconds ?? 0)} 秒`;
    case 'end': {
      const fields = (config.fields as Array<{ key?: string }> | undefined) ?? [];
      return fields.map((item) => item.key).filter(Boolean).join('、');
    }
    case 'note':
      return typeof config.text === 'string' ? config.text : '';
    default:
      return '';
  }
};

export const FlowNodeCard = memo(({ data, selected }: NodeProps<FlowCanvasNode>) => {
  const flowType = data.flowType ?? 'llm';
  const meta = nodeMetaByKey(flowType);
  const Icon = meta?.icon;
  const status = data.status;
  const isNote = flowType === 'note';

  return (
    <div
      className={[
        'flow-node-card',
        isNote ? 'note' : '',
        selected ? 'selected' : '',
        status ? `status-${status}` : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {meta?.hasTarget && <Handle type="target" position={Position.Left} />}
      <div className="flow-node-card-header">
        {Icon && (
          <span className="flow-node-card-icon" style={{ background: meta.color }}>
            <Icon />
          </span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flow-node-card-name">{data.name || meta?.label || flowType}</div>
          <div className="flow-node-card-type">{isNote ? '备注' : `${meta?.label ?? flowType} 节点`}</div>
        </div>
      </div>
      <div className="flow-node-card-summary">
        {summarize(flowType, data.config) || '\u00A0'}
      </div>
      {status && STATUS_ICON[status] && (
        <span className="flow-node-status" title={status}>
          {STATUS_ICON[status]}
        </span>
      )}
      {meta?.hasSource && <Handle type="source" position={Position.Right} />}
    </div>
  );
});

FlowNodeCard.displayName = 'FlowNodeCard';
