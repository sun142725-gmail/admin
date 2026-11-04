// donchian 模板信号纯函数单测（方案 §9）。
// fixture 手工推演（entryN=5/exitN=3，10 根）：
//   idx0..4: h=10 l=9 c=9.5；idx5: h=11.5 l=10.2 c=10.5（>max(high[0..4])=10 → BUY；当日高点 11.5
//   进通道即无信号 → 未来函数反证）；idx6: h=11.8 l=10.6 c=11.6（>max(high[0..5])=11.5 → 连续 BUY）；
//   idx7: h=11.9 l=11.5 c=11.6（11.6>11.8? 否 → 无信号）；idx8: h=10.2 l=9.9 c=10.0
//   （<min(low[5..7])=10.2 → SELL）；idx9: h=10.1 l=9.9 c=10.0（10.0<min(low[6..8])=9.9? 否 → 无信号）。
import { donchianStrategy } from '../src/modules/stock/strategy/strategy-templates.util';
import { StrategyInput } from '../src/modules/stock/strategy/strategy.types';

const DATES = [
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07',
  '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14'
];
// [open, high, low, close]
const OHLC: Array<[number, number, number, number]> = [
  [9.5, 10, 9, 9.5],
  [9.5, 10, 9, 9.5],
  [9.5, 10, 9, 9.5],
  [9.5, 10, 9, 9.5],
  [9.5, 10, 9, 9.5],
  [10.2, 11.5, 10.2, 10.5],
  [10.6, 11.8, 10.6, 11.6],
  [11.6, 11.9, 11.5, 11.6],
  [10.0, 10.2, 9.9, 10.0],
  [10.0, 10.1, 9.9, 10.0]
];

const buildInput = (params: Record<string, unknown> = { entryN: 5, exitN: 3, atrPeriod: 14 }): StrategyInput => ({
  barsBySymbol: {
    sh510300: OHLC.map(([open, high, low, close], i) => ({
      date: DATES[i],
      open,
      high,
      low,
      close,
      volume: 1000,
      amount: close * 1000
    }))
  },
  params,
  simStartDate: '2026-09-01'
});

describe('donchian strategy template', () => {
  it('emits breakout/breakdown dates exactly (channel excludes the current bar)', () => {
    expect(donchianStrategy.generateSignals(buildInput())).toEqual([
      { date: DATES[5], symbol: 'sh510300', action: 'buy' },
      { date: DATES[6], symbol: 'sh510300', action: 'buy' }, // 连续突破日重复 buy（撮合层 already_holding 承接）
      { date: DATES[8], symbol: 'sh510300', action: 'sell' }
    ]);
  });

  it('future-function proof: with the current bar inside the channel the breakout day would be silent', () => {
    // 反证构造：idx5 当日高点 11.5 > 收盘 10.5——若通道含当日（max(high[i-entryN..i])），
    // 阈值变成 11.5 → close 10.5 不再突破 → BUY 消失；只有「前 N 根不含当日」实现才能检出。
    const signals = donchianStrategy.generateSignals(buildInput());
    expect(signals.some((signal) => signal.date === DATES[5] && signal.action === 'buy')).toBe(true);
  });

  it('no signals before entryN/exitN warmup completes', () => {
    // entryN=5：idx1..4 不做 buy 判定；exitN=3：sell 最早 idx3 起（本 fixture idx3/4 收盘 9.5
    // 均不小于前 3 根最低 9 → 无信号）。故首个信号只能出现在 idx5 及以后。
    const warmup = donchianStrategy.generateSignals(buildInput());
    expect(warmup.length).toBeGreaterThan(0);
    expect(warmup.every((signal) => signal.date >= DATES[5])).toBe(true);
  });

  it('signals carry direction only (no quantity/ATR — sizing belongs to the matching layer plugin)', () => {
    const signals = donchianStrategy.generateSignals(buildInput());
    for (const signal of signals) {
      expect(Object.keys(signal).sort()).toEqual(['action', 'date', 'symbol']);
    }
  });

  it('validateParams rejects exitN>entryN, out-of-range and unknown keys', () => {
    expect(donchianStrategy.validateParams({ entryN: 5, exitN: 6, atrPeriod: 14 })).toContain(
      '参数 exitN 必须小于等于 entryN'
    );
    expect(donchianStrategy.validateParams({ entryN: 4, exitN: 3, atrPeriod: 14 })).toContain(
      '参数 entryN 必须为 [5, 120] 内的整数'
    );
    expect(donchianStrategy.validateParams({ entryN: 5, exitN: 2, atrPeriod: 14 })).toContain(
      '参数 exitN 必须为 [3, 60] 内的整数'
    );
    expect(donchianStrategy.validateParams({ entryN: 5, exitN: 3, atrPeriod: 1 })).toContain(
      '参数 atrPeriod 必须为 [2, 60] 内的整数'
    );
    expect(donchianStrategy.validateParams({ entryN: 5, exitN: 3, atrPeriod: 14, lookbackN: 5 })).toEqual([
      expect.stringContaining('未知参数键 lookbackN')
    ]);
    expect(donchianStrategy.validateParams({ entryN: 5, exitN: 3, atrPeriod: 14 })).toEqual([]);
  });

  it('template metadata: single-symbol with ATR default position model', () => {
    expect(donchianStrategy.singleSymbol).toBe(true);
    expect(donchianStrategy.defaultPositionModel).toEqual({
      type: 'atr',
      riskPct: 0.01,
      maxPositionPct: 1,
      atrPeriod: 14
    });
  });
});
