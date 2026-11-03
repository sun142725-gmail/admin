// 回测仓位模型纯函数单测（不依赖网络与 Nest 容器）：三内置各一例手推值 + atr=null → 0
// + 注入 fake model 验证插件被撮合内核调用（可插拔性可测）。
import { runBacktest } from '../src/modules/stock/backtest/backtest-match.util';
import {
  atrModel,
  allInModel,
  fixedRatioModel,
  PositionContext
} from '../src/modules/stock/backtest/backtest-sizing.util';
import { BacktestConfig, Bar, Signal } from '../src/modules/stock/backtest/backtest.types';

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

const config = (overrides: Partial<BacktestConfig> = {}): BacktestConfig => ({
  initialCash: 100000,
  limitUpPct: 0.1,
  limitDownPct: -0.1,
  limitEps: 0.005,
  cost: { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0 },
  ...overrides
});

const ctx = (overrides: Partial<PositionContext> = {}): PositionContext => ({
  equity: 100000,
  cash: 100000,
  bar: bar('2026-09-21', 10),
  atr: 1,
  config: config(),
  ...overrides
});

describe('allInModel', () => {
  it('①预算 = 全部可用现金（与净值无关）', () => {
    expect(allInModel().budget(ctx({ cash: 1000, equity: 120000 }))).toBe(1000);
  });
});

describe('fixedRatioModel', () => {
  it('②预算 = min(净值×ratio, 现金)：现金充裕时取比例值 100000×0.5', () => {
    expect(fixedRatioModel(0.5).budget(ctx())).toBe(50000);
  });

  it('③现金不足时被现金钳制：min(90000, 10000) = 10000', () => {
    expect(fixedRatioModel(0.9).budget(ctx({ cash: 10000 }))).toBe(10000);
  });
});

describe('atrModel', () => {
  it('④预算 = equity×riskPct/atr×close：100000×0.01/2×10 = 5000', () => {
    expect(atrModel({ riskPct: 0.01, maxPositionPct: 1 }).budget(ctx({ atr: 2, bar: bar('2026-09-21', 10) }))).toBe(5000);
  });

  it('⑤最大仓位钳制：风险预算超 cap 时取 equity×maxPositionPct', () => {
    // 100000×0.01/0.001×10 = 10,000,000 → cap 100000×0.5 = 50000
    expect(atrModel({ riskPct: 0.01, maxPositionPct: 0.5 }).budget(ctx({ atr: 0.001 }))).toBe(50000);
  });

  it('⑥现金钳制：三 者 取最小', () => {
    // 风险预算 5000 < cap 100000，现金 3000 → 3000
    expect(atrModel({ riskPct: 0.01, maxPositionPct: 1 }).budget(ctx({ atr: 2, cash: 3000 }))).toBe(3000);
  });

  it('⑦atr=null → 0（撮合内核据此记 atr_unavailable）', () => {
    expect(atrModel({ riskPct: 0.01, maxPositionPct: 1 }).budget(ctx({ atr: null }))).toBe(0);
  });
});

describe('插件可插拔（fake model 注入撮合内核被调用）', () => {
  it('⑧内核用插件预算定股数：budget=5500、开盘 11 → floor(5500/11/100)×100=500 股', () => {
    const calls: PositionContext[] = [];
    const fakeModel = {
      name: 'fixed-ratio' as const,
      budget: (c: PositionContext) => {
        calls.push(c);
        return 5500;
      }
    };
    const bars: Bar[] = [
      bar('2026-09-21', 11),
      bar('2026-09-22', 11)
    ];
    const signals: Signal[] = [{ date: '2026-09-21', action: 'buy' }];
    const result = runBacktest({ bars, signals, config: config(), positionModel: fakeModel });
    // 插件被调用一次，上下文含信号日 bar 与净值
    expect(calls).toHaveLength(1);
    expect(calls[0].bar.date).toBe('2026-09-21');
    expect(calls[0].equity).toBe(100000);
    expect(calls[0].cash).toBe(100000);
    // 股数按预算整手：floor(5500/11/100)×100 = 500
    expect(result.trades[0].shares).toBe(500);
    expect(result.trades[0].gross).toBe(5500);
  });

  it('⑨fake model 返回 0 → 放弃买入记 insufficient_funds', () => {
    const fakeModel = { name: 'all-in' as const, budget: () => 0 };
    const bars = [bar('2026-09-21', 10), bar('2026-09-22', 10)];
    const result = runBacktest({
      bars,
      signals: [{ date: '2026-09-21', action: 'buy' }],
      config: config(),
      positionModel: fakeModel
    });
    expect(result.trades[0].status).toBe('skipped');
    expect(result.trades[0].skipReason).toBe('insufficient_funds');
  });
});
