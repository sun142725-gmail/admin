// 内置演示信号纯函数单测（不依赖网络与 Nest 容器）：金叉/死叉触发日写死
// + e2e 主 fixture 同款 27 根阶梯序列交叉日复核 + 无未来函数扰动测试（方案 §4.4）。
import { maCrossDemoSignals } from '../src/modules/stock/backtest/backtest-demo-signal.util';
import { Bar } from '../src/modules/stock/backtest/backtest.types';

const bar = (date: string, close: number, overrides: Partial<Bar> = {}): Bar => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1000,
  amount: close * 1000,
  ...overrides
});

describe('maCrossDemoSignals（自定义快慢周期小序列）', () => {
  // closes [10,10,10,10,12]，fast=2/slow=3：i=4 时 fast 11 > slow 10.667、前一日 10 = 10 → 金叉
  const goldenBars = [10, 10, 10, 10, 12].map((c, i) => bar(`2026-09-0${i + 1}`, c));

  it('①金叉触发日写死（最后一根上穿）', () => {
    expect(maCrossDemoSignals(goldenBars, 2, 3)).toEqual([{ date: '2026-09-05', action: 'buy' }]);
  });

  // closes [10,10,10,10,8]：i=4 时 fast 9 < slow 9.333、前一日 10 >= 10 → 死叉
  const deadBars = [10, 10, 10, 10, 8].map((c, i) => bar(`2026-09-0${i + 1}`, c));

  it('②死叉触发日写死', () => {
    expect(maCrossDemoSignals(deadBars, 2, 3)).toEqual([{ date: '2026-09-05', action: 'sell' }]);
  });

  it('③慢线未成热值（根数不足）无信号', () => {
    expect(maCrossDemoSignals(goldenBars.slice(0, 3), 2, 3)).toEqual([]);
  });

  it('④恒定价格无交叉', () => {
    const flat = Array.from({ length: 25 }, (_, i) => bar(`2026-09-${String(i + 1).padStart(2, '0')}`, 10));
    expect(maCrossDemoSignals(flat)).toEqual([]);
  });
});

// e2e 主 fixture 同款 27 根工作日阶梯（默认 fast=5/slow=20）：前 20 根 10，随后 11,11,12,13,9,4,4。
// 金叉/死叉手工推演（方案 §4.3）：09-21 MA5=10.2>MA20=10.05（前日 10=10）→ buy；09-28 MA5=9.8<MA20=10.0 → sell。
const MAIN_DATES = [
  '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
  '2026-08-31',
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
  '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
  '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
  '2026-09-28', '2026-09-29'
];
const MAIN_CLOSES = [...Array(20).fill(10), 11, 11, 12, 13, 9, 4, 4];
const mainFixtureBars = (): Bar[] => MAIN_DATES.map((date, i) => bar(date, MAIN_CLOSES[i]));

describe('maCrossDemoSignals（e2e 主 fixture 27 根阶梯，默认 5/20）', () => {
  it('⑤信号恰为 buy@09-21 与 sell@09-28 两条', () => {
    expect(maCrossDemoSignals(mainFixtureBars())).toEqual([
      { date: '2026-09-21', action: 'buy' },
      { date: '2026-09-28', action: 'sell' }
    ]);
  });

  it('⑥无未来函数：扰动第 i 根之后的 bar，[0..i] 段信号深度不变', () => {
    const baseline = maCrossDemoSignals(mainFixtureBars());
    expect(baseline.length).toBeGreaterThan(0);
    for (const i of [0, 7, 19, 20, 24]) {
      const disturbed = mainFixtureBars();
      // 扰动 i 之后所有 bar 的四价一量（剧烈跳变也不得影响此前信号）
      for (let j = i + 1; j < disturbed.length; j += 1) {
        disturbed[j] = {
          ...disturbed[j],
          open: disturbed[j].open * 3 + 1,
          high: disturbed[j].high * 5 + 2,
          low: Math.max(0.01, disturbed[j].low * 0.1),
          close: disturbed[j].close * 2 + 7,
          volume: disturbed[j].volume + 999
        };
      }
      // 只比较 date ≤ bars[i].date 的信号段（扰动只允许影响未来）
      const cutoff = mainFixtureBars()[i].date;
      const expected = baseline.filter((s) => s.date <= cutoff);
      const actual = maCrossDemoSignals(disturbed).filter((s) => s.date <= cutoff);
      expect(actual).toEqual(expected);
    }
  });

  it('⑦扰动最后一根本身：其之前的信号不变（末根信号可合法新增，不属未来函数）', () => {
    const baseline = maCrossDemoSignals(mainFixtureBars());
    const disturbed = mainFixtureBars();
    disturbed[26] = { ...disturbed[26], close: 100, open: 100, high: 100, low: 100 };
    const cutoff = mainFixtureBars()[25].date; // 末根之前的信号段
    expect(maCrossDemoSignals(disturbed).filter((s) => s.date <= cutoff)).toEqual(
      baseline.filter((s) => s.date <= cutoff)
    );
  });
});
