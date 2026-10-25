// 圆桌专家展示元数据：头像/配色/流派（与后端 experts.definitions.ts 的 code 对应）。
import type { StanceDirection } from '../../api/stock';

export interface ExpertMeta {
  code: string;
  name: string;
  school: string;
  avatar: string;
  color: string;
}

export const EXPERTS: ExpertMeta[] = [
  { code: 'stock-trend', name: '道远', school: '趋势派', avatar: '📈', color: '#1677ff' },
  { code: 'stock-momentum', name: '小雷', school: '动量派', avatar: '⚡', color: '#fa8c16' },
  { code: 'stock-flow', name: '墨量', school: '量价派', avatar: '🌊', color: '#13c2c2' },
  { code: 'stock-value', name: '守拙', school: '价值派', avatar: '🏛️', color: '#ad6800' },
  { code: 'stock-risk', name: '谨言', school: '风控派', avatar: '🛡️', color: '#f5222d' }
];

export const MODERATOR: ExpertMeta = {
  code: 'stock-moderator',
  name: '衡之',
  school: '会议主席',
  avatar: '⚖️',
  color: '#531dab'
};

export const expertOf = (code: string): ExpertMeta =>
  EXPERTS.find((item) => item.code === code) ?? {
    code,
    name: code,
    school: '专家',
    avatar: '🧑‍💼',
    color: '#737373'
  };

// A 股惯例：红涨绿跌。
export const STANCE_COLOR: Record<StanceDirection, string> = {
  bull: 'var(--color-stock-up)',
  bear: 'var(--color-stock-down)',
  neutral: 'var(--color-text-sub)'
};

export const STANCE_LABEL: Record<StanceDirection, string> = {
  bull: '看多',
  bear: '看空',
  neutral: '中性'
};

export const STAGE_STEPS: Array<{ key: string; label: string }> = [
  { key: 'preparing', label: '数据准备' },
  { key: 'round1', label: '独立分析' },
  { key: 'debating', label: '交叉辩论' },
  { key: 'summarizing', label: '主席总结' },
  { key: 'completed', label: '会议结论' }
];
