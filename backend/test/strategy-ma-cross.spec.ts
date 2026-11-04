// ma-cross 模板信号纯函数单测（方案 §9）：不起 Nest 容器、不触网。
// 主 fixture 沿用 stock-backtest.spec.ts:27-37 的 27 根工作日阶梯推演法：
//   前 20 根 close=10，随后 11,11,12,13,9,4,4（o=h=l=c；信号生成只看收盘，无涨跌停判定环节）。
//   期望值手工推演写死：MA5/MA20 金叉 2026-09-21（idx20）、死叉 2026-09-28（idx25）——
//   与内核演示信号同源（模板直接参数化包装 maCrossDemoSignals，判定式逐字一致）。
import { maCrossStrategy, getStrategyDefinition, STRATEGY_TEMPLATES } from '../src/modules/stock/strategy/strategy-templates.util';
import { StrategyInput } from '../src/modules/stock/strategy/strategy.types';

const MAIN_DATES = [
  '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
  '2026-08-31',
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
  '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
  '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
  '2026-09-28', '2026-09-29'
];
const MAIN_LADDER = [...Array(20).fill(10), 11, 11, 12, 13, 9, 4, 4];

const bar = (date: string, close: number) => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1000,
  amount: close * 1000
});

const buildInput = (closes: number[], params: Record<string, unknown> = { fastN: 5, slowN: 20 }, simStartDate = '2026-08-01'): StrategyInput => ({
  barsBySymbol: { sh600519: closes.map((close, i) => bar(MAIN_DATES[i] ?? `2026-10-${String(i + 1).padStart(2, '0')}`, close)) },
  params,
  simStartDate
});

describe('ma-cross strategy template', () => {
  it('emits golden/dead cross dates exactly (hand-derived on the 27-bar ladder)', () => {
    const signals = maCrossStrategy.generateSignals(buildInput(MAIN_LADDER));
    expect(signals).toEqual([
      { date: '2026-09-21', symbol: 'sh600519', action: 'buy' }, // idx20: prev MA5=10<=MA20=10 && MA5=10.4>MA20=10.1
      { date: '2026-09-28', symbol: 'sh600519', action: 'sell' } // idx25: prev MA5=11.4>=MA20=10.6 && MA5=9.8<MA20=10
    ]);
  });

  it('respects fastN/slowN params (slowN=3 detects the same crosses on a shorter window)', () => {
    // fastN=2/slowN=3：金叉仍在 idx20（10<=10 && 10.5>10.333），死叉提前到 idx24（9 跳水当日前一根）
    const signals = maCrossStrategy.generateSignals(buildInput(MAIN_LADDER, { fastN: 2, slowN: 3 }));
    expect(signals.map((signal) => [signal.date, signal.action])).toEqual([
      ['2026-09-21', 'buy'],
      ['2026-09-25', 'sell']
    ]);
  });

  it('validateParams rejects fastN>=slowN and out-of-range/unknown keys', () => {
    expect(maCrossStrategy.validateParams({ fastN: 20, slowN: 20 })).toContain('参数 fastN 必须小于 slowN');
    expect(maCrossStrategy.validateParams({ fastN: 20, slowN: 5 })).toContain('参数 fastN 必须小于 slowN');
    expect(maCrossStrategy.validateParams({ fastN: 1, slowN: 20 })).toContain('参数 fastN 必须为 [2, 60] 内的整数');
    expect(maCrossStrategy.validateParams({ fastN: 5, slowN: 121 })).toContain('参数 slowN 必须为 [3, 120] 内的整数');
    expect(maCrossStrategy.validateParams({ fastN: 5.5, slowN: 20 })).toContain('参数 fastN 必须为 [2, 60] 内的整数');
    expect(maCrossStrategy.validateParams({ fastN: 5, slowN: 20, simStartDate: '2026-01-01' })).toEqual([
      expect.stringContaining('未知参数键 simStartDate')
    ]);
    expect(maCrossStrategy.validateParams({ fastN: 5, slowN: 20 })).toEqual([]);
  });

  it('returns no signals for bars below minBars', () => {
    expect(maCrossStrategy.generateSignals(buildInput([10]))).toEqual([]);
    expect(maCrossStrategy.generateSignals({ barsBySymbol: {}, params: { fastN: 5, slowN: 20 }, simStartDate: '2026-08-01' })).toEqual([]);
  });

  it('causality: flipping the last bar never changes signals strictly before it', () => {
    const flipped = [...MAIN_LADDER];
    flipped[flipped.length - 1] = 40; // 末根 4→40
    const before = maCrossStrategy
      .generateSignals(buildInput(MAIN_LADDER))
      .filter((signal) => signal.date < MAIN_DATES[MAIN_DATES.length - 1]);
    const after = maCrossStrategy
      .generateSignals(buildInput(flipped))
      .filter((signal) => signal.date < MAIN_DATES[MAIN_DATES.length - 1]);
    expect(after).toEqual(before);
    // 末根自身允许出现新信号（其判定只读 closes[0..末根]），但不影响历史
    expect(maCrossStrategy.generateSignals(buildInput(flipped)).every((s) => s.date <= MAIN_DATES[MAIN_DATES.length - 1])).toBe(true);
  });

  it('registry: template whitelisted and lookup works (unknown -> null)', () => {
    expect(STRATEGY_TEMPLATES).toEqual(['ma-cross', 'macd', 'donchian', 'etf-momentum']);
    expect(getStrategyDefinition('ma-cross')).toBe(maCrossStrategy);
    expect(getStrategyDefinition('nope')).toBeNull();
    expect(maCrossStrategy.singleSymbol).toBe(true);
    expect(maCrossStrategy.defaultParams).toEqual({ fastN: 5, slowN: 20 });
  });
});
