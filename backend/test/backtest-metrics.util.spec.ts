// 回测绩效指标纯函数单测（不依赖网络与 Nest 容器）：8 指标各含构造序列手推期望值
// + 边界（N=0/常数序列 std=0/零回撤/无回合 null/全亏盈亏比 0/期末未恢复回撤天数）
// + 计数口径（tradeCount 只计 filled、roundTripCount=已平仓回合数）。
import {
  ANNUAL_DAYS,
  computeMetrics
} from '../src/modules/stock/backtest/backtest-metrics.util';
import {
  BacktestMetrics,
  EquityPoint,
  TradeRecord,
  TradeStatus,
  SignalAction,
  SkipReason
} from '../src/modules/stock/backtest/backtest.types';

const point = (date: string, equity: number): EquityPoint => ({
  date,
  cash: equity,
  shares: 0,
  close: equity,
  equity
});

const curve = (equities: number[]): EquityPoint[] =>
  equities.map((e, i) => point(`2026-09-${String(i + 1).padStart(2, '0')}`, e));

let seq = 0;
const trade = (overrides: Partial<TradeRecord> = {}): TradeRecord => {
  seq += 1;
  return {
    signalDate: `2026-09-${String(seq).padStart(2, '0')}`,
    signalAction: 'buy',
    status: 'filled',
    skipReason: null,
    tradeDate: `2026-09-${String(seq).padStart(2, '0')}`,
    price: 10,
    filledPrice: 10,
    shares: 100,
    gross: 1000,
    fee: 0,
    cashAfter: 0,
    positionAfter: 100,
    lastBuyTradeDate: null,
    ...overrides
  };
};

const filledBuy = (gross: number, fee: number): TradeRecord =>
  trade({ signalAction: 'buy', status: 'filled', gross, fee });
const filledSell = (gross: number, fee: number): TradeRecord =>
  trade({ signalAction: 'sell', status: 'filled', gross, fee });
const skipped = (action: SignalAction, reason: SkipReason): TradeRecord =>
  trade({ signalAction: action, status: 'skipped' as TradeStatus, skipReason: reason, tradeDate: null, price: null, filledPrice: null, gross: null, fee: null, shares: 0 });

const metricsOf = (equities: number[], trades: TradeRecord[] = []): BacktestMetrics =>
  computeMetrics(curve(equities), trades, 100);

describe('常量', () => {
  it('①ANNUAL_DAYS=252（导出供测试）', () => {
    expect(ANNUAL_DAYS).toBe(252);
  });
});

describe('totalReturn / annualizedReturn', () => {
  it('②总收益率 E_N/E_0−1：[100,110,99] → −0.01', () => {
    expect(metricsOf([100, 110, 99]).totalReturn).toBeCloseTo(-0.01, 12);
  });

  it('③年化 (1+total)^(252/N)−1（N=点数−1）：[100,110,99] → 0.99^126−1', () => {
    const expected = Math.pow(0.99, 252 / 2) - 1; // 测试内手写独立算式
    expect(metricsOf([100, 110, 99]).annualizedReturn).toBeCloseTo(expected, 10);
  });

  it('④totalReturn=−1 → 年化 −1；N=0（单点）→ 年化 0', () => {
    expect(metricsOf([100, 0]).annualizedReturn).toBe(-1);
    expect(metricsOf([100]).annualizedReturn).toBe(0);
  });
});

describe('maxDrawdown / longestDrawdownDays', () => {
  it('⑤最大回撤 [100,120,90,100] → 1−90/120=0.25；单调上升 → 0', () => {
    expect(metricsOf([100, 120, 90, 100]).maxDrawdown).toBeCloseTo(0.25, 12);
    expect(metricsOf([1, 2, 3]).maxDrawdown).toBe(0);
  });

  it('⑥最长回撤天数（创新高含持平更新峰值）：[100,120,90,100,130,125] → 2', () => {
    // 峰值 idx1=120；t2 候选 1、t3 候选 2；t4 创新高 130；t5 候选 1 → max=2
    expect(metricsOf([100, 120, 90, 100, 130, 125]).longestDrawdownDays).toBe(2);
  });

  it('⑦期末未恢复按最后一天计（ongoing 计入）：[100,120,90,95] → 2', () => {
    expect(metricsOf([100, 120, 90, 95]).longestDrawdownDays).toBe(2);
  });

  it('⑧常数序列无回撤：[100,100,100] → maxDD 0、天数 0', () => {
    const m = metricsOf([100, 100, 100]);
    expect(m.maxDrawdown).toBe(0);
    expect(m.longestDrawdownDays).toBe(0);
  });
});

describe('sharpe（总体标准差口径）', () => {
  it('⑨构造序列：r=[0.1,−0.05] → mean 0.025、总体 std 0.075 → (1/3)×√252', () => {
    const m = metricsOf([100, 110, 104.5]);
    const expected = ((0.1 - 0.05) / 2 / 0.075) * Math.sqrt(252); // 测试内手写独立算式
    expect(m.sharpe).toBeCloseTo(expected, 10);
  });

  it('⑩常数日收益 std=0 → 0；收益数<2 → 0', () => {
    expect(metricsOf([100, 110, 121]).sharpe).toBe(0); // r=[0.1,0.1]
    expect(metricsOf([100, 110]).sharpe).toBe(0); // 仅 1 个日收益
  });
});

describe('calmar', () => {
  it('⑪maxDD>0 → annualized/maxDD；零回撤 → null', () => {
    const m = metricsOf([100, 110, 99]);
    const annual = Math.pow(0.99, 126) - 1; // 测试内手写独立算式
    expect(m.calmar).toBeCloseTo(annual / 0.1, 10);
    expect(metricsOf([100, 110]).calmar).toBeNull();
  });
});

describe('胜率 / 盈亏比 / 回合计数', () => {
  it('⑫单盈利回合：r=1180/1010−1>0 → winRate 1、PLR null（无亏损回合）、roundTrip 1', () => {
    const m = metricsOf([100, 110], [filledBuy(1000, 10), filledSell(1200, 20)]);
    expect(m.winRate).toBe(1);
    expect(m.profitLossRatio).toBeNull();
    expect(m.roundTripCount).toBe(1);
    expect(m.tradeCount).toBe(2);
  });

  it('⑬单亏损回合：r=880/1010−1<0 → winRate 0、PLR 0（有亏损无盈利）', () => {
    const m = metricsOf([100, 90], [filledBuy(1000, 10), filledSell(900, 20)]);
    expect(m.winRate).toBe(0);
    expect(m.profitLossRatio).toBe(0);
  });

  it('⑭两回合盈 0.2 / 亏 0.1：winRate 0.5、PLR=0.2/0.1=2', () => {
    const trades = [
      filledBuy(1000, 0),
      filledSell(1200, 0), // r=+0.2
      filledBuy(1000, 0),
      filledSell(900, 0) // r=−0.1
    ];
    const m = metricsOf([100, 110, 100], trades);
    expect(m.winRate).toBe(0.5);
    expect(m.profitLossRatio).toBeCloseTo(2, 12);
    expect(m.roundTripCount).toBe(2);
  });

  it('⑮无回合 → winRate/PLR null、roundTrip 0；零收益回合不计盈亏：winRate 0、PLR null', () => {
    const none = metricsOf([100, 100], []);
    expect(none.winRate).toBeNull();
    expect(none.profitLossRatio).toBeNull();
    expect(none.roundTripCount).toBe(0);

    const flat = metricsOf([100, 100], [filledBuy(1000, 0), filledSell(1000, 0)]);
    expect(flat.winRate).toBe(0); // r=0 不计盈利
    expect(flat.profitLossRatio).toBeNull(); // 无亏损回合
    expect(flat.roundTripCount).toBe(1);
  });
});

describe('turnover（年化，买卖双侧各计一次）', () => {
  it('⑯Σfilled gross/(mean(E)×(N/252))：E=[100,200]、gross 100+110 → 210×252/150', () => {
    const m = metricsOf([100, 200], [filledBuy(100, 0), filledSell(110, 0)]);
    expect(m.turnover).toBeCloseTo(210 / (150 * (1 / 252)), 10);
  });

  it('⑰N=0 → 0；mean(E)=0 → 0', () => {
    expect(metricsOf([100], [filledBuy(100, 0)]).turnover).toBe(0);
    expect(metricsOf([0, 0], [filledBuy(100, 0)]).turnover).toBe(0);
  });
});

describe('计数口径（v3 钉死）', () => {
  it('⑱tradeCount 只计 filled：skipped 输入不计入；roundTripCount=已平仓回合数', () => {
    const trades = [
      skipped('buy', 'limit_up'),
      filledBuy(1000, 0),
      skipped('sell', 't_plus_1'),
      filledSell(1100, 0),
      skipped('buy', 'insufficient_funds')
    ];
    const m = metricsOf([100, 105], trades);
    expect(m.tradeCount).toBe(2);
    expect(m.roundTripCount).toBe(1);
  });

  it('⑲空曲线退化输入 → 零值指标（防御分支）', () => {
    const m = computeMetrics([], [], 100);
    expect(m).toEqual({
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      longestDrawdownDays: 0,
      sharpe: 0,
      calmar: null,
      winRate: null,
      profitLossRatio: null,
      turnover: 0,
      tradeCount: 0,
      roundTripCount: 0
    });
  });
});
