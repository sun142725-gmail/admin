// 节点类型注册表：画布图标/配色/默认配置的唯一来源，编辑器与配置面板共用。
import type { ComponentType } from 'react';
import {
  ApiOutlined,
  ClockCircleOutlined,
  FlagOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  CommentOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';
import type { FlowDag, FlowVariable } from '../../../api/flows';

export interface NodeMeta {
  key: string;
  label: string;
  icon: ComponentType<{ style?: React.CSSProperties }>;
  color: string;
  description: string;
  hasSource: boolean;
  hasTarget: boolean;
  defaultName: string;
  defaultConfig: () => Record<string, unknown>;
}

export const NODE_META: NodeMeta[] = [
  {
    key: 'start',
    label: '开始',
    icon: PlayCircleOutlined,
    color: '#52c41a',
    description: '定义入参变量（主题/风格/参考图地址等）',
    hasSource: true,
    hasTarget: false,
    defaultName: '开始',
    defaultConfig: () => ({
      variables: [
        { name: 'topic', label: '视频主题', defaultValue: '', required: 1 }
      ] as FlowVariable[]
    })
  },
  {
    key: 'llm',
    label: 'LLM',
    icon: RobotOutlined,
    color: '#1677ff',
    description: '脚本/分镜生成，支持 JSON 结构化输出',
    hasSource: true,
    hasTarget: true,
    defaultName: 'LLM 节点',
    defaultConfig: () => ({
      systemPrompt: '',
      prompt: '{{start.topic}}',
      outputFormat: 'text',
      temperature: 0.7
    })
  },
  {
    key: 'image',
    label: '生图',
    icon: PictureOutlined,
    color: '#722ed1',
    description: '分镜首帧/插画生成（image 能力模型）',
    hasSource: true,
    hasTarget: true,
    defaultName: '生图节点',
    defaultConfig: () => ({ prompt: '', size: '1024x1024', count: 1 })
  },
  {
    key: 'video',
    label: '视频',
    icon: VideoCameraOutlined,
    color: '#fa541c',
    description: '文生/图生视频（video 能力模型）',
    hasSource: true,
    hasTarget: true,
    defaultName: '视频节点',
    defaultConfig: () => ({ prompt: '', firstFrame: '', seconds: 5, size: '' })
  },
  {
    key: 'http',
    label: 'HTTP',
    icon: ApiOutlined,
    color: '#13c2c2',
    description: '调用任意三方接口（配乐/素材/回调）',
    hasSource: true,
    hasTarget: true,
    defaultName: 'HTTP 节点',
    defaultConfig: () => ({ method: 'GET', url: '', headers: {}, body: '', timeoutMs: 15000 })
  },
  {
    key: 'delay',
    label: '延时',
    icon: ClockCircleOutlined,
    color: '#8c8c8c',
    description: '等待若干秒（限速/人工确认）',
    hasSource: true,
    hasTarget: true,
    defaultName: '延时节点',
    defaultConfig: () => ({ seconds: 5 })
  },
  {
    key: 'end',
    label: '结束',
    icon: FlagOutlined,
    color: '#faad14',
    description: '汇总产物字段（视频地址/脚本等）',
    hasSource: false,
    hasTarget: true,
    defaultName: '结束',
    defaultConfig: () => ({ fields: [{ key: 'result', value: '' }] })
  },
  {
    key: 'note',
    label: '备注',
    icon: CommentOutlined,
    color: '#bfbfbf',
    description: '画布便签，不参与执行',
    hasSource: false,
    hasTarget: false,
    defaultName: '备注',
    defaultConfig: () => ({ text: '写点说明…' })
  }
];

export const nodeMetaByKey = (key: string): NodeMeta | undefined =>
  NODE_META.find((meta) => meta.key === key);

/** 给新节点起不重名的标题（如「生图节点 2」）。 */
export const nextNodeName = (nodes: FlowDag['nodes'], type: string): string => {
  const meta = nodeMetaByKey(type);
  const base = meta?.defaultName ?? type;
  const names = new Set(nodes.map((node) => node.data?.name));
  if (!names.has(base)) {
    return base;
  }
  for (let index = 2; ; index += 1) {
    if (!names.has(`${base} ${index}`)) {
      return `${base} ${index}`;
    }
  }
};

/** 各节点类型的输出字段提示（变量插入面板用；llm 的 JSON 字段动态未知）。 */
export const outputFieldsOf = (type: string, config?: Record<string, unknown>): string[] => {
  switch (type) {
    case 'start':
      return ((config?.variables as FlowVariable[] | undefined) ?? []).map((item) => item.name);
    case 'llm':
      return config?.outputFormat === 'json' ? ['<JSON 字段>', 'text'] : ['text'];
    case 'image':
      return ['url', 'images'];
    case 'video':
      return ['url', 'taskId'];
    case 'http':
      return ['status', 'data'];
    case 'delay':
      return ['waited'];
    default:
      return [];
  }
};
