// 选股信号展示工具：KDJ/MACD 信号 Tag 与命中摘要列（手动扫描结果与每日扫描面板共用）。
import React from 'react';
import { Button, Popconfirm, Tag, Tooltip } from 'antd';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import type { ScreenerFreq } from '../../../api/screener';

export interface SignalLike {
  status: 'golden' | 'upcoming' | null;
  barsAgo?: number;
  gap?: number;
}

export const FREQ_LABEL: Record<ScreenerFreq, string> = { day: '日线', week: '周线', month: '月线' };

export const renderSignal = (signal: SignalLike) => {
  if (signal.status === 'golden') {
    const ago = signal.barsAgo ?? 0;
    return <Tag color="red">{ago === 0 ? '刚刚金叉' : `${ago} 根前金叉`}</Tag>;
  }
  if (signal.status === 'upcoming') {
    return (
      <Tooltip title={`快线在慢线下方，差距 ${signal.gap} 且持续收敛，按当前速度约 3 根内可能交叉`}>
        <Tag color="orange">即将金叉</Tag>
      </Tooltip>
    );
  }
  return <Tag>无信号</Tag>;
};

/** 命中摘要列（周期/最新价/涨跌幅/KDJ/MACD 的紧凑展示）。 */
export const renderPct = (v: number | string | null | undefined) => {
  // MySQL decimal 列经 TypeORM 返回字符串，先收敛为数值
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n == null || !Number.isFinite(n)) {
    return '-';
  }
  return (
    <span style={{ color: n > 0 ? '#cf1322' : n < 0 ? '#3f8600' : undefined }}>{n.toFixed(2)}%</span>
  );
};

export const renderPrice = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n != null && Number.isFinite(n) ? n.toFixed(2) : '-';
};

export const starColumn = <T extends { symbol: string; name: string }>(
  favoriteSymbols: Set<string>,
  onToggle: (symbol: string, name: string) => void
): ColumnType<T> => ({
  title: '',
  key: 'star',
  width: 50,
  render: (_: unknown, record: T) => {
    const isFavorite = favoriteSymbols.has(record.symbol);
    // 加自选直接执行；移除需二次确认（Popconfirm 包裹）
    if (isFavorite) {
      return (
        <PopconfirmStar symbol={record.symbol} name={record.name} onToggle={onToggle} />
      );
    }
    return (
      <Button
        type="text"
        size="small"
        aria-label="加入自选"
        onClick={() => onToggle(record.symbol, record.name)}
        icon={<StarOutlined style={{ color: '#bfbfbf' }} />}
      />
    );
  }
});

const PopconfirmStar = ({
  symbol,
  name,
  onToggle
}: {
  symbol: string;
  name: string;
  onToggle: (symbol: string, name: string) => void;
}) => (
  <Popconfirm title="移出自选？" onConfirm={() => onToggle(symbol, name)}>
    <Button type="text" size="small" aria-label="移出自选" icon={<StarFilled style={{ color: '#faad14' }} />} />
  </Popconfirm>
);
