// K 线图：蜡烛图 + MA + 成交量 + 可切换副图指标（MACD/KDJ/RSI/BOLL），数据由后端算好。
import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Segmented } from 'antd';
import type { KlineResult } from '../../../api/stock';

type SubIndicator = 'macd' | 'kdj' | 'rsi' | 'boll';

interface Props {
  result: KlineResult;
  height?: number;
}

const UP_COLOR = '#f5222d';
const DOWN_COLOR = '#16a34a';
const MA_COLORS: Record<string, string> = {
  ma5: '#fa8c16',
  ma10: '#1677ff',
  ma20: '#9254de',
  ma60: '#13c2c2'
};

const buildOption = (result: KlineResult, sub: SubIndicator) => {
  const { items, indicators } = result;
  const dates = items.map((k) => k.date);
  // echarts 蜡烛图维度：[开, 收, 低, 高]。
  const candles = items.map((k) => [k.open, k.close, k.low, k.high]);
  const volumes = items.map((k, i) => ({
    value: k.volume,
    itemStyle: { color: k.close >= items[i].open || i === 0 ? UP_COLOR : DOWN_COLOR, opacity: 0.55 }
  }));

  const series: object[] = [
    {
      name: 'K线',
      type: 'candlestick',
      data: candles,
      xAxisIndex: 0,
      yAxisIndex: 0,
      itemStyle: { color: UP_COLOR, color0: DOWN_COLOR, borderColor: UP_COLOR, borderColor0: DOWN_COLOR }
    },
    ...(['ma5', 'ma10', 'ma20', 'ma60'] as const)
      .filter((key) => sub !== 'boll' || key === 'ma20')
      .map((key) => ({
        name: key.toUpperCase(),
        type: 'line',
        data: indicators?.[key] ?? [],
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1, color: MA_COLORS[key] },
        itemStyle: { color: MA_COLORS[key] },
        emphasis: { disabled: true }
      })),
    {
      name: '成交量',
      type: 'bar',
      data: volumes,
      xAxisIndex: 1,
      yAxisIndex: 1
    }
  ];

  if (sub === 'boll' && indicators) {
    (['upper', 'mid', 'lower'] as const).forEach((key) => {
      series.push({
        name: `BOLL-${key}`,
        type: 'line',
        data: indicators.boll[key],
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1, type: key === 'mid' ? 'solid' : 'dashed', color: '#9254de' },
        itemStyle: { color: '#9254de' },
        emphasis: { disabled: true }
      });
    });
  }

  if (sub === 'macd' && indicators) {
    series.push(
      {
        name: 'DIF',
        type: 'line',
        data: indicators.macd.dif,
        xAxisIndex: 2,
        yAxisIndex: 2,
        showSymbol: false,
        lineStyle: { width: 1, color: '#1677ff' },
        itemStyle: { color: '#1677ff' }
      },
      {
        name: 'DEA',
        type: 'line',
        data: indicators.macd.dea,
        xAxisIndex: 2,
        yAxisIndex: 2,
        showSymbol: false,
        lineStyle: { width: 1, color: '#fa8c16' },
        itemStyle: { color: '#fa8c16' }
      },
      {
        name: 'MACD',
        type: 'bar',
        data: (indicators.macd.histogram ?? []).map((v) => ({
          value: v,
          itemStyle: { color: (v ?? 0) >= 0 ? UP_COLOR : DOWN_COLOR, opacity: 0.7 }
        })),
        xAxisIndex: 2,
        yAxisIndex: 2
      }
    );
  }

  if (sub === 'kdj' && indicators) {
    (
      [
        ['K', indicators.kdj.k, '#1677ff'],
        ['D', indicators.kdj.d, '#fa8c16'],
        ['J', indicators.kdj.j, '#722ed1']
      ] as const
    ).forEach(([name, data, color]) => {
      series.push({
        name,
        type: 'line',
        data,
        xAxisIndex: 2,
        yAxisIndex: 2,
        showSymbol: false,
        lineStyle: { width: 1, color },
        itemStyle: { color }
      });
    });
  }

  if (sub === 'rsi' && indicators) {
    (
      [
        ['RSI6', indicators.rsi6, '#1677ff'],
        ['RSI12', indicators.rsi12, '#fa8c16'],
        ['RSI24', indicators.rsi24, '#722ed1']
      ] as const
    ).forEach(([name, data, color]) => {
      series.push({
        name,
        type: 'line',
        data,
        xAxisIndex: 2,
        yAxisIndex: 2,
        showSymbol: false,
        lineStyle: { width: 1, color },
        itemStyle: { color }
      });
    });
  }

  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#ebebeb',
      textStyle: { color: '#1a1a1a', fontSize: 12 }
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    legend: {
      top: 0,
      textStyle: { color: '#737373', fontSize: 11 },
      itemWidth: 14,
      itemHeight: 8
    },
    grid: [
      { left: 56, right: 16, top: 28, height: '50%' },
      { left: 56, right: 16, top: '64%', height: '10%' },
      { left: 56, right: 16, top: '77%', height: '13%' }
    ],
    xAxis: [
      { type: 'category', data: dates, gridIndex: 0, show: false, boundaryGap: true },
      { type: 'category', data: dates, gridIndex: 1, show: false },
      {
        type: 'category',
        data: dates,
        gridIndex: 2,
        axisLine: { lineStyle: { color: '#ebebeb' } },
        axisLabel: { color: '#737373', fontSize: 10 }
      }
    ],
    yAxis: [
      {
        scale: true,
        gridIndex: 0,
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        axisLabel: { color: '#737373', fontSize: 10 }
      },
      {
        gridIndex: 1,
        axisLabel: { show: false },
        splitLine: { show: false }
      },
      {
        scale: true,
        gridIndex: 2,
        splitLine: { show: false },
        axisLabel: { color: '#737373', fontSize: 10 }
      }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: 60, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1, 2], bottom: 6, height: 16, borderColor: '#ebebeb' }
    ],
    series
  };
};

export const KlineChart: React.FC<Props> = ({ result, height = 480 }) => {
  const [sub, setSub] = useState<SubIndicator>('macd');
  const option = useMemo(() => buildOption(result, sub), [result, sub]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-text-sub">{result.name} 日K（前复权）</span>
        <Segmented
          size="small"
          value={sub}
          onChange={(value) => setSub(value as SubIndicator)}
          options={[
            { label: 'MACD', value: 'macd' },
            { label: 'KDJ', value: 'kdj' },
            { label: 'RSI', value: 'rsi' },
            { label: 'BOLL', value: 'boll' }
          ]}
        />
      </div>
      <ReactECharts option={option} style={{ height, width: '100%' }} notMerge lazyUpdate />
    </div>
  );
};
