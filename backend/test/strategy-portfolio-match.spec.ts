// 组合撮合重放器单测（方案 §9）：等价性用例按「映射剥离后 toEqual」实现（弱化断言=防漂移名存实亡，
// 禁止——剥离映射：equityCurve 去 marketValue、trades 去 symbol，其余字段逐一相等）；
// 轮动换仓资金/涨跌停与 suspended/no_bar skip/T+1 滑点/同日先卖后买/分组配对指标全部手推写死。
import {
  runPortfolioBacktest,
  computePortfolioMetrics,
  PortfolioTradeRecord
} from '../src/modules/stock/strategy/strategy-portfolio-match.util';
import { runBacktest, DEFAULT_CONFIG } from '../src/modules/stock/backtest/backtest-match.util';
import { computeMetrics } from '../src/modules/stock/backtest/backtest-metrics.util';
import { maCrossDemoSignals } from '../src/modules/stock/backtest/backtest-demo-signal.util';
import { allInModel } from '../src/modules/stock/backtest/backtest-sizing.util';
import { Bar, BacktestConfig, SkipReason, TradeRecord } from '../src/modules/stock/backtest/backtest.types';
import { StrategySignal } from '../src/modules/stock/strategy/strategy.types';

const bar = (date: string, open: number, close: number, volume = 1000): Bar => ({
  date,
  open,
  high: Math.max(open, close),
  low: Math.min(open, close),
  close,
  volume,
  amount: close * volume
});

const ZERO_COST: BacktestConfig = {
  ...DEFAULT_CONFIG,
  cost: { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0 }
};

const sig = (date: string, symbol: string, action: 'buy' | 'sell'): StrategySignal => ({ date, symbol, action });

/** 手工构造 PortfolioTradeRecord（分组配对纯函数用，不经撮合器）。 */
const trade = (
  symbol: string,
  signalAction: 'buy' | 'sell',
  signalDate: string,
  gross: number,
  cashAfter: number
): PortfolioTradeRecord => ({
  signalDate,
  signalAction,
  status: 'filled',
  skipReason: null,
  tradeDate: signalDate,
  price: gross,
  filledPrice: gross,
  shares: 100,
  gross,
  fee: 0,
  cashAfter,
  positionAfter: 100,
  lastBuyTradeDate: signalAction === 'buy' ? signalDate : null,
  symbol
});

describe('runPortfolioBacktest equivalence with the kernel (single-symbol input)', () => {
  it('mapping-stripped toEqual against runBacktest on the 27-bar ladder (zero cost, all-in)', () => {
    const MAIN_DATES = [
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
      '2026-08-31',
      '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
      '2026-09-28', '2026-09-29'
    ];
    const LADDER = [...Array(20).fill(10), 11, 11, 12, 13, 9, 4, 4];
    const bars = LADDER.map((close, i) => bar(MAIN_DATES[i], close, close));
    const demo = maCrossDemoSignals(bars); // 金叉 09-21 / 死叉 09-28
    const config: BacktestConfig = { ...ZERO_COST };
    const positionModel = allInModel();

    const kernel = runBacktest({
      bars,
      signals: demo.map(({ date, action }) => ({ date, action })),
      config,
      positionModel
    });
    const portfolio = runPortfolioBacktest({
      barsBySymbol: { sh600519: bars },
      signals: demo.map((signal) => ({ ...signal, symbol: 'sh600519' })),
      config,
      positionModel
    });

    // 映射剥离后 toEqual 全等（组合结果多 symbol/marketValue/finalCash/holdings 字段，直接 toEqual 必失败）
    const mapping = {
      equityCurve: portfolio.equityCurve.map(({ marketValue, ...rest }) => rest),
      trades: portfolio.trades.map(({ symbol, ...rest }) => rest),
      metrics: portfolio.metrics,
      config: portfolio.config
    };
    expect(mapping).toEqual(kernel);
    // 组合层自有字段一致性手推：finalCash=清仓后现金 37000；holdings 清空
    expect(portfolio.finalCash).toBe(37000);
    expect(portfolio.holdings).toEqual([]);
    expect(portfolio.trades.every((t) => t.symbol === 'sh600519')).toBe(true);
    expect(portfolio.equityCurve.every((point) => point.marketValue === point.equity - point.cash)).toBe(true);
  });
});

describe('runPortfolioBacktest rotation scenarios (hand-derived)', () => {
  const DATES = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];

  it('rotation cash handover: same-day sell-before-buy, exact fills and cash', () => {
    const barsBySymbol = {
      sh510300: [bar(DATES[0], 10, 10), bar(DATES[1], 10, 10), bar(DATES[2], 10, 10), bar(DATES[3], 10, 10)],
      sz510500: [bar(DATES[0], 20, 20), bar(DATES[1], 20, 20), bar(DATES[2], 22, 22), bar(DATES[3], 22, 22)]
    };
    const signals = [sig(DATES[0], 'sz510500', 'buy'), sig(DATES[2], 'sz510500', 'sell'), sig(DATES[2], 'sh510300', 'buy')];
    const result = runPortfolioBacktest({
      barsBySymbol,
      signals,
      config: { ...ZERO_COST },
      positionModel: allInModel()
    });

    // 手推：d1 买 B @20 → 5000 股（10 万全仓）；d3 [卖 B @22 → 现金 11 万；买 A @10 → 11000 股]（先卖腾资金）
    expect(result.trades).toEqual([
      expect.objectContaining({
        symbol: 'sz510500', signalAction: 'buy', status: 'filled', tradeDate: DATES[1],
        filledPrice: 20, shares: 5000, gross: 100000, fee: 0, cashAfter: 0
      }),
      expect.objectContaining({
        symbol: 'sz510500', signalAction: 'sell', status: 'filled', tradeDate: DATES[3],
        filledPrice: 22, shares: 5000, gross: 110000, fee: 0, cashAfter: 110000
      }),
      expect.objectContaining({
        symbol: 'sh510300', signalAction: 'buy', status: 'filled', tradeDate: DATES[3],
        filledPrice: 10, shares: 11000, gross: 110000, fee: 0, cashAfter: 0
      })
    ]);
    expect(result.finalCash).toBe(0);
    expect(result.holdings).toEqual([{ symbol: 'sh510300', shares: 11000, lastBuyTradeDate: DATES[3] }]);
    // 净值点（记账时点=内核：T 日净值已按 T+1 开盘成交结算——d0 信号日的点已含 d1 开盘成交后的现金 0）
    expect(result.equityCurve.map((point) => [point.date, point.cash, point.equity])).toEqual([
      [DATES[0], 0, 100000],
      [DATES[1], 0, 100000],
      [DATES[2], 0, 110000],
      [DATES[3], 0, 110000]
    ]);
    // 分组配对：B 一回合 +10%
    expect(result.metrics.roundTripCount).toBe(1);
    expect(result.metrics.winRate).toBe(1);
    expect(result.metrics.profitLossRatio).toBeNull();
    expect(result.metrics.totalReturn).toBeCloseTo(0.1, 12);
  });

  it('limit_up / limit_down / suspended skips reuse the kernel reason codes', () => {
    // 三个场景各自独立单标的组合（组合现金共享，隔离后手推股数唯一确定）
    const run = (bars: Bar[], signals: StrategySignal[]) =>
      runPortfolioBacktest({ barsBySymbol: { sh600000: bars }, signals, config: { ...ZERO_COST }, positionModel: allInModel() });

    // 涨停 skip：d2 开盘 +10%（≥0.10−0.005 → 一字板不买）
    const limitUp = run(
      [bar(DATES[0], 10, 10), bar(DATES[1], 11, 11), bar(DATES[2], 11, 11)],
      [sig(DATES[0], 'sh600000', 'buy')]
    );
    expect(limitUp.trades[0]).toEqual(
      expect.objectContaining({ status: 'skipped', skipReason: 'limit_up', tradeDate: DATES[1], price: 11 })
    );

    // 跌停 skip：买入 d2 成交（10500 股@9.5）后，d3 开盘 −10.5%（≤−0.10+0.005 → 一字板不卖）
    const limitDown = run(
      [bar(DATES[0], 10, 10), bar(DATES[1], 9.5, 9.5), bar(DATES[2], 8.5, 8.5), bar(DATES[3], 8.5, 8.5)],
      [sig(DATES[0], 'sh600000', 'buy'), sig(DATES[1], 'sh600000', 'sell')]
    );
    expect(limitDown.trades[0]).toEqual(
      expect.objectContaining({ status: 'filled', skipReason: null, tradeDate: DATES[1], filledPrice: 9.5, shares: 10500 })
    );
    expect(limitDown.trades[1]).toEqual(
      expect.objectContaining({ status: 'skipped', skipReason: 'limit_down', tradeDate: DATES[2], price: 8.5 })
    );

    // 停牌占位（volume=0）：sell 的 T+1 bar 为停牌占位行 → suspended（tradeDate/price 仍=该停牌 bar）
    const suspended = run(
      [bar(DATES[0], 10, 10), bar(DATES[1], 10, 10), bar(DATES[2], 10, 10, 0), bar(DATES[3], 10, 10)],
      [sig(DATES[0], 'sh600000', 'buy'), sig(DATES[1], 'sh600000', 'sell')]
    );
    expect(suspended.trades[0]).toEqual(
      expect.objectContaining({ status: 'filled', tradeDate: DATES[1], filledPrice: 10, shares: 10000 })
    );
    expect(suspended.trades[1]).toEqual(
      expect.objectContaining({ status: 'skipped', skipReason: 'suspended', tradeDate: DATES[2], price: 10 })
    );
  });

  it('missing bar rows on a signal date produce an explicit no_bar record (double null), never silent drop', () => {
    const barsBySymbol = {
      // B 缺 d3 整行（真实停牌形态）——d3 的卖出信号 no_bar；d4 仍在
      sz510500: [bar(DATES[0], 20, 20), bar(DATES[1], 20, 20), bar(DATES[3], 22, 22)],
      sh510300: [bar(DATES[0], 10, 10), bar(DATES[1], 10, 10), bar(DATES[2], 10, 10), bar(DATES[3], 10, 10)]
    };
    const result = runPortfolioBacktest({
      barsBySymbol,
      signals: [sig(DATES[0], 'sz510500', 'buy'), sig(DATES[2], 'sz510500', 'sell')],
      config: { ...ZERO_COST },
      positionModel: allInModel()
    });
    expect(result.trades).toHaveLength(2);
    expect(result.trades[1]).toEqual({
      signalDate: DATES[2],
      signalAction: 'sell',
      status: 'skipped',
      skipReason: 'no_bar',
      tradeDate: null,
      price: null,
      filledPrice: null,
      shares: 0,
      gross: null,
      fee: null,
      cashAfter: 0,
      positionAfter: 5000,
      lastBuyTradeDate: DATES[1],
      symbol: 'sz510500'
    });
    // 持仓不受 no_bar 影响
    expect(result.holdings).toEqual([{ symbol: 'sz510500', shares: 5000, lastBuyTradeDate: DATES[1] }]);
  });

  it('T+1 fill price with slippage is exact (buy fills higher, sell fills lower)', () => {
    const barsBySymbol = {
      sh600004: [
        bar(DATES[0], 11, 11),
        bar(DATES[1], 11, 11),
        bar(DATES[2], 12, 12),
        bar(DATES[3], 12, 12)
      ]
    };
    const config: BacktestConfig = {
      ...DEFAULT_CONFIG,
      cost: { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0.001 }
    };
    const result = runPortfolioBacktest({
      barsBySymbol,
      signals: [sig(DATES[0], 'sh600004', 'buy'), sig(DATES[2], 'sh600004', 'sell')],
      config,
      positionModel: allInModel()
    });
    const buy = result.trades[0];
    const sell = result.trades[1];
    expect(buy.status).toBe('filled');
    expect(buy.filledPrice).toBeCloseTo(11.011, 12); // 11×(1+0.001)
    expect(sell.filledPrice).toBeCloseTo(11.988, 12); // 12×(1−0.001)
    expect(buy.shares).toBe(9000); // floor(100000/11.011/100)×100
  });

  it('t_plus_1 is enforced per symbol (same-day buy+sell: the sell fills on the buy fill day → skipped)', () => {
    const barsBySymbol = {
      sh600005: [
        bar(DATES[0], 10, 10),
        bar(DATES[1], 10, 10),
        bar(DATES[2], 10, 10),
        bar(DATES[3], 10, 10)
      ]
    };
    const result = runPortfolioBacktest({
      barsBySymbol,
      // 同日 [buy, sell]（输入序）：buy d1 成交（lastBuy=d1），sell 也在 d1 成交 → lastBuy<next.date 不成立 → t_plus_1
      signals: [sig(DATES[0], 'sh600005', 'buy'), sig(DATES[0], 'sh600005', 'sell')],
      config: { ...ZERO_COST },
      positionModel: allInModel()
    });
    expect(result.trades[0]).toEqual(
      expect.objectContaining({ status: 'filled', tradeDate: DATES[1], filledPrice: 10, shares: 10000 })
    );
    expect(result.trades[1]).toEqual(
      expect.objectContaining({ status: 'skipped', skipReason: 't_plus_1', tradeDate: DATES[1] })
    );
    expect(result.holdings).toEqual([{ symbol: 'sh600005', shares: 10000, lastBuyTradeDate: DATES[1] }]);
  });
});

describe('computePortfolioMetrics grouped round-trip pairing', () => {
  it('pairs per symbol: interleaved fills (buyA→buyB→sellA→sellB) count two rounds', () => {
    const trades: PortfolioTradeRecord[] = [
      trade('shA', 'buy', '2026-09-01', 1000, 0),
      trade('shB', 'buy', '2026-09-02', 2000, 0),
      trade('shA', 'sell', '2026-09-03', 900, 0),
      trade('shB', 'sell', '2026-09-04', 2200, 0)
    ];
    // 分组配对手推：A −10%（亏）、B +10%（盈）→ 2 回合、胜率 0.5、盈亏比 1
    const metrics = computePortfolioMetrics([], trades, 3000);
    expect(metrics.roundTripCount).toBe(2);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.profitLossRatio).toBeCloseTo(1, 12);
    expect(metrics.tradeCount).toBe(4);
  });

  it('counter-proof: computeMetrics on the same input mis-pairs interleaved fills (single scalar)', () => {
    const trades: PortfolioTradeRecord[] = [
      trade('shA', 'buy', '2026-09-01', 1000, 0),
      trade('shB', 'buy', '2026-09-02', 2000, 0),
      trade('shA', 'sell', '2026-09-03', 900, 0),
      trade('shB', 'sell', '2026-09-04', 2200, 0)
    ];
    // 内核单标量配对：B 的卖出毛额与 A→B 覆盖后的买入成本 2000 配对（+10%），A 的卖出被 openBuyCost=null 丢弃
    const kernelShaped: TradeRecord[] = trades.map(({ symbol, skipReason, ...rest }) => ({
      ...rest,
      skipReason: skipReason as SkipReason | null
    }));
    const curve = [
      { date: '2026-09-01', cash: 3000, shares: 0, close: 0, equity: 3000 },
      { date: '2026-09-04', cash: 3200, shares: 0, close: 0, equity: 3200 }
    ];
    const wrong = computeMetrics(curve, kernelShaped, 3000);
    expect(wrong.roundTripCount).toBe(1);
    // 全序配对只产生一个假回合：sellA(900) 与覆盖后的 openBuyCost=2000 配对 → r=−55%（亏损）
    expect(wrong.winRate).toBe(0);
    expect(wrong.profitLossRatio).toBe(0); // 有亏损无盈利 → 0
    // 组合层三指标与内核直出不同（防漂移反证：三指标不得经 computeMetrics 产出）
    const grouped = computePortfolioMetrics(curve, trades, 3000);
    expect(grouped.roundTripCount).toBe(2);
    expect(grouped.winRate).toBe(0.5);
    expect(grouped.profitLossRatio).toBeCloseTo(1, 12);
    expect(grouped.roundTripCount).not.toBe(wrong.roundTripCount);
    expect(grouped.winRate).not.toBe(wrong.winRate);
  });

  it('empty rounds keep null semantics', () => {
    const trades: PortfolioTradeRecord[] = [
      { ...trade('shA', 'buy', '2026-09-01', 1000, 0), status: 'skipped' as const, skipReason: 'no_bar', gross: null, fee: null }
    ];
    const metrics = computePortfolioMetrics([], trades, 1000);
    expect(metrics.roundTripCount).toBe(0);
    expect(metrics.winRate).toBeNull();
    expect(metrics.profitLossRatio).toBeNull();
  });
});
