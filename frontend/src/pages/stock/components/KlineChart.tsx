// K 线图（同花顺风格）：黑底面板 + 右侧价格轴 + 顶部十字光标行情读取栏。
// 结构：主图（蜡烛+MA/BOLL+最新价虚线）→ 成交量副图 → 指标副图（MACD/KDJ/RSI/BOLL 可切换）。
// 光标悬停时读取栏联动显示：日期 / MA值 / 开收高低 / 涨跌幅涨跌额 / 成交量成交额振幅换手率。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { KlineResult } from '../../../api/stock';

type SubIndicator = 'macd' | 'kdj' | 'rsi' | 'boll';

interface Props {
  result: KlineResult;
  height?: number;
}

// 同花顺配色：黑底、红涨绿跌、MA 白/黄/紫/青
const T = {
  bg: '#0d1015',
  border: '#1e232b',
  text: '#c9cdd4',
  sub: '#7b8290',
  split: '#1b1f27',
  axis: '#333a45',
  cross: '#5b6472',
  up: '#f5222d',
  down: '#00b578',
  flat: '#c9cdd4',
  accent: '#f7b500'
};
const MA_COLORS: Record<string, string> = {
  ma5: '#ffffff',
  ma10: '#f7b500',
  ma20: '#e05fd0',
  ma60: '#31c6c6'
};

const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '--' : v.toFixed(d));
// 量额大数缩写：亿 / 万
const fmtBig = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '--';
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return v.toFixed(0);
};
const priceColor = (close: number, prevClose: number | null) => {
  if (prevClose == null || prevClose <= 0 || close === prevClose) return T.flat;
  return close > prevClose ? T.up : T.down;
};
const span = (label: string, value: string, color = T.text) =>
  `<span style="margin-right:12px;white-space:nowrap"><span style="color:${T.sub}">${label}</span><span style="color:${color}">${value}</span></span>`;

const SUB_TABS: Array<{ key: SubIndicator; label: string }> = [
  { key: 'macd', label: 'MACD' },
  { key: 'kdj', label: 'KDJ' },
  { key: 'rsi', label: 'RSI' },
  { key: 'boll', label: 'BOLL' }
];

const buildOption = (result: KlineResult, sub: SubIndicator) => {
  const { items, indicators } = result;
  const dates = items.map((k) => k.date);
  const candles = items.map((k) => [k.open, k.close, k.low, k.high]);
  const volumes = items.map((k, i) => ({
    value: k.volume,
    itemStyle: { color: i > 0 && k.close < items[i - 1].close ? T.down : T.up, opacity: 0.85 }
  }));
  const lastBar = items[items.length - 1];
  const lastPrev = items.length > 1 ? items[items.length - 2].close : null;
  const lastColor = priceColor(lastBar?.close ?? 0, lastPrev);
  // 默认展示最近约 120 根 K 线
  const zoomStart = items.length > 120 ? 100 - (120 / items.length) * 100 : 0;

  const series: object[] = [
    {
      name: 'K线',
      type: 'candlestick',
      data: candles,
      xAxisIndex: 0,
      yAxisIndex: 0,
      itemStyle: { color: T.up, color0: T.down, borderColor: T.up, borderColor0: T.down },
      markLine: {
        symbol: 'none',
        silent: true,
        animation: false,
        label: {
          position: 'end',
          formatter: () => fmt(lastBar?.close),
          color: lastColor,
          fontSize: 10,
          fontFamily: 'monospace'
        },
        lineStyle: { color: lastColor, type: 'dashed', width: 1, opacity: 0.9 },
        data: lastBar ? [{ yAxis: lastBar.close }] : []
      }
    }
  ];

  // 主图叠加：MA（BOLL 模式下只留 MA20 中轨）或 BOLL 三轨
  if (sub === 'boll' && indicators) {
    (['upper', 'mid', 'lower'] as const).forEach((key) => {
      series.push({
        name: `BOLL-${key}`,
        type: 'line',
        data: indicators.boll[key],
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1, type: key === 'mid' ? 'solid' : 'dashed', color: key === 'mid' ? '#ffffff' : MA_COLORS.ma20 },
        itemStyle: { color: key === 'mid' ? '#ffffff' : MA_COLORS.ma20 },
        emphasis: { disabled: true }
      });
    });
  } else {
    (['ma5', 'ma10', 'ma20', 'ma60'] as const).forEach((key) => {
      series.push({
        name: key.toUpperCase(),
        type: 'line',
        data: indicators?.[key] ?? [],
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1, color: MA_COLORS[key] },
        itemStyle: { color: MA_COLORS[key] },
        emphasis: { disabled: true }
      });
    });
  }

  series.push({
    name: '成交量',
    type: 'bar',
    data: volumes,
    xAxisIndex: 1,
    yAxisIndex: 1
  });

  const subLine = (name: string, data: (number | null)[], color: string, dash = false) => ({
    name,
    type: 'line',
    data,
    xAxisIndex: 2,
    yAxisIndex: 2,
    showSymbol: false,
    lineStyle: { width: 1, color, type: dash ? 'dashed' : 'solid' },
    itemStyle: { color },
    emphasis: { disabled: true }
  });

  if (sub === 'macd' && indicators) {
    series.push(
      subLine('DIF', indicators.macd.dif, '#ffffff'),
      subLine('DEA', indicators.macd.dea, '#f7b500'),
      {
        name: 'MACD',
        type: 'bar',
        data: (indicators.macd.histogram ?? []).map((v) => ({
          value: v,
          itemStyle: { color: (v ?? 0) >= 0 ? T.up : T.down, opacity: 0.85 }
        })),
        xAxisIndex: 2,
        yAxisIndex: 2
      }
    );
  } else if (sub === 'kdj' && indicators) {
    series.push(
      subLine('K', indicators.kdj.k, '#ffffff'),
      subLine('D', indicators.kdj.d, '#f7b500'),
      subLine('J', indicators.kdj.j, '#e05fd0')
    );
  } else if (sub === 'rsi' && indicators) {
    series.push(
      subLine('RSI6', indicators.rsi6, '#ffffff'),
      subLine('RSI12', indicators.rsi12, '#f7b500'),
      subLine('RSI24', indicators.rsi24, '#e05fd0')
    );
  } else if (sub === 'boll') {
    series.push(
      subLine('BOLL-M', indicators?.boll.mid ?? [], '#ffffff'),
      subLine('BOLL-U', indicators?.boll.upper ?? [], '#f7b500', true),
      subLine('BOLL-L', indicators?.boll.lower ?? [], '#31c6c6', true)
    );
  }

  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove|click',
      confine: true,
      alwaysShowContent: true,
      // 读取栏固定在面板左上角（同花顺式），不跟随光标
      position: () => [10, 8],
      backgroundColor: 'rgba(10,12,16,0.94)',
      borderColor: T.border,
      borderWidth: 1,
      padding: [6, 10],
      extraCssText: 'max-width:none;border-radius:4px;',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: T.cross, type: 'dashed' },
        crossStyle: { color: T.cross },
        label: { backgroundColor: '#2a2f3a', color: '#c9cdd4', fontSize: 10 }
      },
      formatter: (params: Array<{ dataIndex?: number }>) => {
        const i = params?.[0]?.dataIndex ?? items.length - 1;
        const k = items[i];
        if (!k) return '';
        const prev = i > 0 ? items[i - 1].close : null;
        const pc = priceColor(k.close, prev);
        const change = prev != null ? k.close - prev : null;
        const pct =
          k.pct != null ? k.pct : prev && prev > 0 ? ((k.close - prev) / prev) * 100 : null;
        const pctColor = pct == null ? T.flat : pct > 0 ? T.up : pct < 0 ? T.down : T.flat;

        // 第一行：MA / BOLL 值（同花顺式随光标联动）
        const maRow =
          sub === 'boll' && indicators
            ? [
                span('BOLL-U: ', fmt(indicators.boll.upper[i]), MA_COLORS.ma20),
                span('MID: ', fmt(indicators.boll.mid[i]), '#ffffff'),
                span('LOW: ', fmt(indicators.boll.lower[i]), '#31c6c6')
              ].join('')
            : ['ma5', 'ma10', 'ma20', 'ma60']
                .map((key) =>
                  span(`${key.toUpperCase()}: `, fmt(indicators?.[key]?.[i] ?? null), MA_COLORS[key])
                )
                .join('');

        // 第二行：副指标值
        const subRow =
          sub === 'macd' && indicators
            ? [
                span('DIF: ', fmt(indicators.macd.dif[i]), (indicators.macd.dif[i] ?? 0) >= 0 ? T.up : T.down),
                span('DEA: ', fmt(indicators.macd.dea[i]), (indicators.macd.dea[i] ?? 0) >= 0 ? T.up : T.down),
                span('MACD: ', fmt(indicators.macd.histogram?.[i] ?? null), (indicators.macd.histogram?.[i] ?? 0) >= 0 ? T.up : T.down)
              ].join('')
            : sub === 'kdj' && indicators
              ? [
                  span('K: ', fmt(indicators.kdj.k[i]), '#ffffff'),
                  span('D: ', fmt(indicators.kdj.d[i]), '#f7b500'),
                  span('J: ', fmt(indicators.kdj.j[i]), '#e05fd0')
                ].join('')
              : sub === 'rsi' && indicators
                ? [
                    span('RSI6: ', fmt(indicators.rsi6[i]), '#ffffff'),
                    span('RSI12: ', fmt(indicators.rsi12[i]), '#f7b500'),
                    span('RSI24: ', fmt(indicators.rsi24[i]), '#e05fd0')
                  ].join('')
                : '';

        // 第三行：四价 + 涨跌
        const ohlcRow = [
          span('开: ', fmt(k.open), pc),
          span('高: ', fmt(k.high), pc),
          span('低: ', fmt(k.low), pc),
          span('收: ', fmt(k.close), pc),
          span('涨跌幅: ', pct == null ? '--' : `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`, pctColor),
          span('涨跌额: ', change == null ? '--' : `${change > 0 ? '+' : ''}${change.toFixed(2)}`, pc)
        ].join('');

        // 第四行：量额
        const volRow = [
          span('成交量: ', `${fmtBig(k.volume)}手`),
          span('成交额: ', `${fmtBig(k.amount)}元`),
          k.amplitude != null ? span('振幅: ', `${k.amplitude.toFixed(2)}%`) : '',
          k.turnover != null ? span('换手: ', `${k.turnover.toFixed(2)}%`) : ''
        ]
          .filter(Boolean)
          .join('');

        const dateRow = `<div style="color:${T.sub};font-size:11px;margin-bottom:2px">${k.date}</div>`;
        const line = (html: string, mb = 2) => (html ? `<div style="margin-bottom:${mb}px">${html}</div>` : '');
        return `${dateRow}${line(maRow)}${line(subRow)}${line(ohlcRow)}${line(volRow, 0)}`;
      }
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 12, right: 58, top: 64, height: '44%' },
      { left: 12, right: 58, top: '65%', height: '10%' },
      { left: 12, right: 58, top: '79%', height: '13%' }
    ],
    xAxis: [
      { type: 'category', data: dates, gridIndex: 0, show: false, boundaryGap: true },
      { type: 'category', data: dates, gridIndex: 1, show: false },
      {
        type: 'category',
        data: dates,
        gridIndex: 2,
        axisLine: { lineStyle: { color: T.axis } },
        axisTick: { show: false },
        axisLabel: { color: T.sub, fontSize: 10 }
      }
    ],
    yAxis: [
      {
        scale: true,
        position: 'right',
        gridIndex: 0,
        splitLine: { lineStyle: { color: T.split } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: T.sub, fontSize: 10 }
      },
      {
        position: 'right',
        gridIndex: 1,
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: T.sub, fontSize: 9, formatter: (v: number) => fmtBig(v) }
      },
      {
        scale: true,
        position: 'right',
        gridIndex: 2,
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: T.sub, fontSize: 10 }
      }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: zoomStart, end: 100 },
      {
        type: 'slider',
        xAxisIndex: [0, 1, 2],
        bottom: 4,
        height: 14,
        borderColor: T.border,
        backgroundColor: '#141821',
        fillerColor: 'rgba(91,100,114,0.30)',
        handleStyle: { color: '#2a2f3a', borderColor: T.cross },
        moveHandleStyle: { color: '#2a2f3a' },
        textStyle: { color: T.sub, fontSize: 9 },
        dataBackground: { lineStyle: { color: T.axis }, areaStyle: { color: 'rgba(51,58,69,0.4)' } },
        selectedDataBackground: { lineStyle: { color: T.cross }, areaStyle: { color: 'rgba(91,100,114,0.25)' } }
      }
    ],
    series
  };
};

export const KlineChart: React.FC<Props> = ({ result, height = 480 }) => {
  const [sub, setSub] = useState<SubIndicator>('macd');
  const chartRef = useRef<ReactECharts>(null);
  // 光标离开后保持最后位置的读取栏（同花顺行为）
  const hoverIndex = useRef<number>(result.items.length - 1);

  const option = useMemo(() => buildOption(result, sub), [result, sub]);

  const showTipAt = (index: number) => {
    const inst = chartRef.current?.getEchartsInstance();
    if (inst && index >= 0) {
      inst.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: index });
    }
  };

  useEffect(() => {
    hoverIndex.current = result.items.length - 1;
    showTipAt(hoverIndex.current);
  }, [result, sub]);

  const onEvents = useMemo(
    () => ({
      mousemove: (params: { dataIndex?: number }) => {
        if (typeof params?.dataIndex === 'number') {
          hoverIndex.current = params.dataIndex;
        }
      },
      globalout: () => showTipAt(hoverIndex.current)
    }),
    []
  );

  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px 6px' }}>
      <div className="flex items-center justify-between" style={{ padding: '0 4px 4px' }}>
        <span style={{ color: T.text, fontSize: 13, fontWeight: 500 }}>
          {result.name} <span style={{ color: T.sub, fontSize: 11 }}>日K（前复权）</span>
        </span>
        <div className="flex items-center">
          {SUB_TABS.map((tab) => (
            <span
              key={tab.key}
              onClick={() => setSub(tab.key)}
              style={{
                marginLeft: 14,
                fontSize: 12,
                cursor: 'pointer',
                color: sub === tab.key ? T.accent : T.sub,
                fontWeight: sub === tab.key ? 600 : 400
              }}
            >
              {tab.label}
            </span>
          ))}
        </div>
      </div>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height, width: '100%' }}
        notMerge
        lazyUpdate
        onEvents={onEvents}
        onChartReady={(inst) => inst?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: result.items.length - 1 })}
      />
    </div>
  );
};
