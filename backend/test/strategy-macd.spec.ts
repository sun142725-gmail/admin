// macd 模板信号纯函数单测（方案 §9）。fixture：30 根 @10 → 5 根 @9.8 → 15 根 @11（50 根工作日）。
// 期望值手工推演写死（独立算式按 indicators.util 头注公式离线推演，不 import 被测模块反推）：
//   DIF=EMA12-EMA26（种子=前 p 项 SMA，k=2/(p+1)），DEA=DIF 的 EMA9（自首个 dif 下标起算）：
//   i=34: dif=-0.049365 <= dea=-0.021101；i=35: dif=+0.043098 > dea=-0.008261 → 金叉(idx35)；
//   i=48: dif=0.254841 >= dea=0.248761；i=49: dif=0.244529 < dea=0.247914 → 死叉(idx49)。
//   中段 dif/dea 全 null（i<33 无 DEA）不参与判定——零值/空序列无信号。
import { macdStrategy } from '../src/modules/stock/strategy/strategy-templates.util';
import { StrategyInput } from '../src/modules/stock/strategy/strategy.types';

/** 工作日日期轴（跳过周末；机械推演只依赖序数）。 */
const workdays = (count: number): string[] => {
  const dates: string[] = [];
  const cursor = new Date('2026-08-24T00:00:00Z');
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const DATES = workdays(50);
const LADDER: number[] = [...Array(30).fill(10), ...Array(5).fill(9.8), ...Array(15).fill(11)];

const buildInput = (closes: number[], params: Record<string, unknown> = { short: 12, long: 26, signal: 9 }): StrategyInput => ({
  barsBySymbol: {
    sz000001: closes.map((close, i) => ({
      date: DATES[i],
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
      amount: close * 1000
    }))
  },
  params,
  simStartDate: '2026-08-01'
});

describe('macd strategy template', () => {
  it('emits hand-derived dif/dea cross dates exactly (golden idx35 / dead idx49)', () => {
    const signals = macdStrategy.generateSignals(buildInput(LADDER));
    expect(signals).toEqual([
      { date: DATES[35], symbol: 'sz000001', action: 'buy' },
      { date: DATES[49], symbol: 'sz000001', action: 'sell' }
    ]);
  });

  it('flat series yields zero signals (dif=dea=0, strict cross unreachable)', () => {
    expect(macdStrategy.generateSignals(buildInput(Array(50).fill(10)))).toEqual([]);
  });

  it('short series (no DEA matured) yields zero signals and bars<minBars yields none', () => {
    expect(macdStrategy.generateSignals(buildInput(LADDER.slice(0, 30)))).toEqual([]);
    expect(macdStrategy.generateSignals(buildInput([10, 10]))).toEqual([]);
  });

  it('validateParams rejects short>=long, out-of-range and unknown keys', () => {
    expect(macdStrategy.validateParams({ short: 26, long: 26 })).toContain('参数 short 必须小于 long');
    expect(macdStrategy.validateParams({ short: 30, long: 26 })).toContain('参数 short 必须小于 long');
    expect(macdStrategy.validateParams({ short: 1, long: 26 })).toContain('参数 short 必须为 [2, 60] 内的整数');
    expect(macdStrategy.validateParams({ short: 12, long: 121 })).toContain('参数 long 必须为 [3, 120] 内的整数');
    expect(macdStrategy.validateParams({ short: 12, long: 26, signal: 1 })).toContain(
      '参数 signal 必须为 [2, 60] 内的整数'
    );
    expect(macdStrategy.validateParams({ short: 12, long: 26, signal: 9, fastN: 5 })).toEqual([
      expect.stringContaining('未知参数键 fastN')
    ]);
    expect(macdStrategy.validateParams({ short: 12, long: 26, signal: 9 })).toEqual([]);
  });
});
