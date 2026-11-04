// 组合层撮合重放器（方案 §1.3）：多标的轮动需要组合级撮合——内核是单持仓语义
// （cash+shares，backtest-match.util.ts:107-109），本文件新增 per-symbol Map 持仓的组合版本。
// 撮合规则与内核逐条同构（内核文件不动）：T+1 开盘成交、fillPrice 滑点买贵卖便宜、
// buyFee/sellFee、比率涨跌停 ±limitEps（backtest-match.util.ts:33-43 口径）、volume===0 停牌、
// already_holding/no_position/insufficient_funds/t_plus_1（按 symbol 各自 lastBuy）、
// 同日信号按输入顺序逐条、先结算成交再记当日净值点（backtest-match.util.ts:210-218 记账时点）。
// 差异四点：
//   ①持仓为 per-symbol Map；
//   ②budget(ctx) 的 ctx.equity=组合净值（现金+Σ持仓×各自「≤当日最近收盘」，日期键控取数）、
//     ctx.cash=组合现金（仓位插件原样复用 backtest-sizing.util.ts）；
//   ③信号日在该标的 bar 序列缺失（真实停牌整行缺失，daily-bars-schedule.service.ts:11-12 口径）
//     → 显式 no_bar skip 记录（tradeDate/price 双 null，对齐内核 no_next_bar 约定
//     backtest.types.ts:46-51），不静默丢弃——volume=0 占位行仍走 suspended，两种停牌形态都覆盖；
//   ④指标：equity 序列类指标直接复用 computeMetrics 公式；winRate/profitLossRatio/roundTripCount
//     按 symbol 分组配对（collectRoundTrips 的单 openBuyCost 标量在 holdTop≥2 交错成交下会把
//     B 的卖出毛额与 A 的买入净成本配对，三指标全错），见 computePortfolioMetrics。
// 等价性保证：单标的输入下与 runBacktest「映射剥离后 toEqual 全等」（strategy-portfolio-match.spec.ts
// 锁定防漂移——剥离映射见该 spec，弱化断言=防漂移名存实亡，禁止）。
// 无 I/O、不依赖 Nest 容器、不 import @nestjs/*。
import { atr } from '../indicators.util';
import { computeMetrics, collectRoundTrips, RoundTrip } from '../backtest/backtest-metrics.util';
import { buyFee, fillPrice, sellFee } from '../backtest/backtest-cost.util';
import { PositionModel } from '../backtest/backtest-sizing.util';
import {
  Bar,
  BacktestConfig,
  BacktestMetrics,
  EquityPoint,
  SkipReason,
  TradeRecord
} from '../backtest/backtest.types';
import { StrategySignal } from './strategy.types';

/** 组合层 skip 码 = 内核 SkipReason + no_bar（信号日在该标的 bar 序列缺失）。 */
export type PortfolioSkipReason = SkipReason | 'no_bar';

/** TS 接口扩展不能换型父属性（skipReason 需收窄重声明），故 Omit 后重声明。 */
export interface PortfolioTradeRecord extends Omit<TradeRecord, 'skipReason'> {
  symbol: string;
  skipReason: PortfolioSkipReason | null;
}

/** 组合净值点：内核 EquityPoint + marketValue（现金+Σ持仓市值中的持仓市值部分）。 */
export interface PortfolioEquityPoint extends EquityPoint {
  marketValue: number;
}

export interface PortfolioBacktestResult {
  equityCurve: PortfolioEquityPoint[];
  trades: PortfolioTradeRecord[];
  /** computePortfolioMetrics 产出（非 computeMetrics 直出——回合三指标为分组配对口径）。 */
  metrics: BacktestMetrics;
  /** 回显（与内核 BacktestResult 对齐 backtest.types.ts:113-118；等价性映射与报告回显都需要）。 */
  config: BacktestConfig;
  finalCash: number;
  holdings: Array<{ symbol: string; shares: number; lastBuyTradeDate: string | null }>;
}

export interface RunPortfolioBacktestInput {
  barsBySymbol: Record<string, Bar[]>;
  signals: StrategySignal[];
  config: BacktestConfig;
  positionModel: PositionModel;
  /** ATR 预计算周期（indicators.util.atr，Wilder 平滑因果实现）；缺省 14。 */
  atrPeriod?: number;
}

/** 买入股数整手计算：与内核 backtest-match.util.ts:64-78 computeBuyShares 逐行同构
 *  （内核文件不动且该助手未导出，故镜像实现；改动两处时必须同步，等价性 spec 兜底）。 */
const computeBuyShares = (
  budget: number,
  filledPrice: number,
  cost: BacktestConfig['cost'],
  cash: number
): number => {
  const perShare = filledPrice * (1 + cost.commissionRate);
  let lots = Math.floor(budget / perShare / 100) * 100;
  const cashAfterBuy = (k: number) =>
    cash - (k * filledPrice + Math.max(k * filledPrice * cost.commissionRate, cost.minCommission));
  while (lots >= 100 && cashAfterBuy(lots) < 0) {
    lots -= 100;
  }
  return lots;
};

export function runPortfolioBacktest(input: RunPortfolioBacktestInput): PortfolioBacktestResult {
  const { barsBySymbol, signals, config, positionModel } = input;
  const atrPeriod = input.atrPeriod ?? 14;
  const symbols = Object.keys(barsBySymbol);

  // 每 symbol 的日期索引与 ATR 预计算序列（indicators.util.atr：因果，atr[i] 只依赖 bars[0..i]）。
  const dateIdxBySymbol = new Map<string, Map<string, number>>();
  const atrBySymbol = new Map<string, (number | null)[]>();
  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol];
    dateIdxBySymbol.set(symbol, new Map(bars.map((bar, i) => [bar.date, i])));
    atrBySymbol.set(
      symbol,
      atr(bars.map((b) => b.high), bars.map((b) => b.low), bars.map((b) => b.close), atrPeriod)
    );
  }

  // 组合日历 = 全部标的 bar 日期并集升序（净值点逐日记账；单标的输入下即该标的 bar 序列，等价性依据）。
  const calendar = [...new Set(symbols.flatMap((symbol) => barsBySymbol[symbol].map((b) => b.date)))].sort();

  /** symbol 在 date 当日（含）之前最近一根收盘价（日期键控取数；无更早 bar 返回 null）。 */
  const lastCloseAtOrBefore = (symbol: string, date: string): number | null => {
    const bars = barsBySymbol[symbol];
    let found: number | null = null;
    for (const bar of bars) {
      if (bar.date > date) {
        break;
      }
      found = bar.close;
    }
    return found;
  };

  const trades: PortfolioTradeRecord[] = [];
  const equityCurve: PortfolioEquityPoint[] = [];

  let cash = config.initialCash;
  const sharesBySymbol = new Map<string, number>();
  const lastBuyBySymbol = new Map<string, string | null>();
  for (const symbol of symbols) {
    sharesBySymbol.set(symbol, 0);
    lastBuyBySymbol.set(symbol, null);
  }
  const totalShares = () => symbols.reduce((sum, symbol) => sum + (sharesBySymbol.get(symbol) ?? 0), 0);

  /** 组合净值点：marketValue=Σ持仓×各自≤当日最近收盘；close=组合折算价
   *  （有持仓=marketValue/总股数——单标的下恰=该标的收盘，等价性依据；空仓=基准标的最近收盘）。 */
  const pushEquityPoint = (date: string): void => {
    let marketValue = 0;
    for (const symbol of symbols) {
      const shares = sharesBySymbol.get(symbol) ?? 0;
      if (shares > 0) {
        const close = lastCloseAtOrBefore(symbol, date);
        if (close != null) {
          marketValue += shares * close;
        }
      }
    }
    const shares = totalShares();
    const fallbackSymbol = symbols[0];
    const fallbackClose = fallbackSymbol ? lastCloseAtOrBefore(fallbackSymbol, date) : null;
    const close = shares > 0 && marketValue > 0 ? marketValue / shares : fallbackClose ?? 0;
    equityCurve.push({ date, cash, shares, close, equity: cash + marketValue, marketValue });
  };

  /** 组合层记录生成：tradeDate/price 与内核同构（T+1 bar 存在恒=该 bar 日期/open，仅
   *  no_next_bar/no_bar 双 null）；cashAfter=组合现金快照、positionAfter=组合总股数、
   *  lastBuyTradeDate=该 symbol 自己的最近买入成交日（T+1 门按 symbol 独立，口径声明）。 */
  const record = (
    signal: StrategySignal,
    status: TradeRecord['status'],
    skipReason: PortfolioSkipReason | null,
    next: Bar | null,
    extra: { filledPrice?: number; shares?: number; gross?: number; fee?: number }
  ): void => {
    trades.push({
      signalDate: signal.date,
      signalAction: signal.action,
      status,
      skipReason,
      tradeDate: next ? next.date : null,
      price: next ? next.open : null,
      filledPrice: extra.filledPrice ?? null,
      shares: extra.shares ?? 0,
      gross: extra.gross ?? null,
      fee: extra.fee ?? null,
      cashAfter: cash,
      positionAfter: totalShares(),
      lastBuyTradeDate: lastBuyBySymbol.get(signal.symbol) ?? null,
      symbol: signal.symbol
    });
  };

  // 同日多信号按输入顺序逐条（内核 backtest-match.util.ts:46-53 保序口径；先卖后买由输入顺序表达）。
  const signalsByDate = new Map<string, StrategySignal[]>();
  for (const signal of signals) {
    const list = signalsByDate.get(signal.date) ?? [];
    list.push(signal);
    signalsByDate.set(signal.date, list);
  }

  for (const date of calendar) {
    const daySignals = signalsByDate.get(date) ?? [];
    for (const signal of daySignals) {
      const symbol = signal.symbol;
      const idxMap = dateIdxBySymbol.get(symbol);
      const t = idxMap?.get(date);
      if (t == null) {
        // 信号日在该标的 bar 序列缺失（真实停牌整行缺失）：显式 no_bar，不静默丢弃（差异③）。
        record(signal, 'skipped', 'no_bar', null, {});
        continue;
      }
      const bars = barsBySymbol[symbol];
      const next = t + 1 < bars.length ? bars[t + 1] : null;
      if (next == null) {
        record(signal, 'skipped', 'no_next_bar', null, {});
        continue;
      }
      if (next.volume === 0) {
        // 停牌占位（stock-daily-bar.entity.ts:41）：不递延，tradeDate/price 仍=该停牌 bar。
        record(signal, 'skipped', 'suspended', next, {});
        continue;
      }
      const prevClose = bars[t].close;
      const ratio = prevClose > 0 ? next.open / prevClose - 1 : NaN;
      const symbolShares = sharesBySymbol.get(symbol) ?? 0;
      if (signal.action === 'buy') {
        if (symbolShares > 0) {
          record(signal, 'skipped', 'already_holding', next, {});
          continue;
        }
        if (ratio >= config.limitUpPct - config.limitEps) {
          record(signal, 'skipped', 'limit_up', next, {});
          continue;
        }
        const ctxAtr = atrBySymbol.get(symbol)?.[t] ?? null;
        if (positionModel.name === 'atr' && ctxAtr == null) {
          record(signal, 'skipped', 'atr_unavailable', next, {});
          continue;
        }
        const budget = positionModel.budget({
          equity: cash + portfolioMarketValue(date),
          cash,
          bar: bars[t],
          atr: ctxAtr,
          config
        });
        const filled = fillPrice(next.open, 'buy', config.cost.slippageRate);
        const lots = computeBuyShares(budget, filled, config.cost, cash);
        if (!(lots >= 100)) {
          // 含 NaN/负预算（模型放弃或资金不足）→ insufficient_funds（内核同码）。
          record(signal, 'skipped', 'insufficient_funds', next, {});
          continue;
        }
        const gross = lots * filled;
        const fee = buyFee(gross, config.cost);
        cash -= gross + fee;
        sharesBySymbol.set(symbol, symbolShares + lots);
        lastBuyBySymbol.set(symbol, next.date);
        record(signal, 'filled', null, next, { filledPrice: filled, shares: lots, gross, fee });
      } else {
        if (symbolShares === 0) {
          record(signal, 'skipped', 'no_position', next, {});
          continue;
        }
        if (ratio <= config.limitDownPct + config.limitEps) {
          record(signal, 'skipped', 'limit_down', next, {});
          continue;
        }
        // T+1 可卖（按 symbol 各自 lastBuy，严格 ISO 字典序；内核 backtest-match.util.ts:195 同式）。
        const lastBuy = lastBuyBySymbol.get(symbol) ?? null;
        if (!(lastBuy != null && lastBuy < next.date)) {
          record(signal, 'skipped', 't_plus_1', next, {});
          continue;
        }
        const filled = fillPrice(next.open, 'sell', config.cost.slippageRate);
        const gross = symbolShares * filled;
        const fee = sellFee(gross, config.cost);
        cash += gross - fee;
        sharesBySymbol.set(symbol, 0);
        lastBuyBySymbol.set(symbol, null);
        record(signal, 'filled', null, next, {
          filledPrice: filled,
          shares: symbolShares,
          gross,
          fee
        });
      }
    }
    // 记账时点：同内核——先按 T+1 open 结算成交再记当日净值点（backtest-match.util.ts:210-218）。
    pushEquityPoint(date);
  }

  const metrics = computePortfolioMetrics(equityCurve, trades, config.initialCash);
  const holdings = symbols
    .filter((symbol) => (sharesBySymbol.get(symbol) ?? 0) > 0)
    .map((symbol) => ({
      symbol,
      shares: sharesBySymbol.get(symbol) ?? 0,
      lastBuyTradeDate: lastBuyBySymbol.get(symbol) ?? null
    }));
  return { equityCurve, trades, metrics, config, finalCash: cash, holdings };

  /** 组合持仓市值（预算 ctx 用）：Σ持仓×各自≤date 最近收盘（日期键控；无持仓股贡献 0）。 */
  function portfolioMarketValue(date: string): number {
    let marketValue = 0;
    for (const symbol of symbols) {
      const shares = sharesBySymbol.get(symbol) ?? 0;
      if (shares > 0) {
        const close = lastCloseAtOrBefore(symbol, date);
        if (close != null) {
          marketValue += shares * close;
        }
      }
    }
    return marketValue;
  }
}

/**
 * 组合层绩效指标：equity 序列类指标（totalReturn/annualized/maxDrawdown/longestDrawdownDays/
 * sharpe/calmar/turnover/tradeCount）直接复用 computeMetrics 公式；winRate/profitLossRatio/
 * roundTripCount 按 symbol 分组配对——collectRoundTrips（backtest-metrics.util.ts:29-45）用单个
 * openBuyCost 标量按 trades 全序配对，holdTop≥2 交错成交（买A→买B→卖B→卖A）会把 B 的卖出毛额
 * 与 A 的买入净成本配对，三指标全错；每 symbol 的 filled 子序列天然单持仓，逐 symbol 配对后汇总。
 * winRate/profitLossRatio 汇总公式与 computeMetrics:127-139 同式（无回合 → null；无亏损 → null；
 * 有亏损无盈利 → 0）。
 */
export function computePortfolioMetrics(
  equityCurve: EquityPoint[],
  trades: PortfolioTradeRecord[],
  initialCash: number
): BacktestMetrics {
  // skipReason 值域收窄不影响回合配对（其只读 status/gross/signalAction），类型对齐用。
  const kernelShaped: Array<TradeRecord & { symbol: string }> = trades.map((trade) => ({
    ...trade,
    skipReason: trade.skipReason as SkipReason | null
  }));
  const base = computeMetrics(equityCurve, kernelShaped, initialCash);

  const symbols = [...new Set(trades.map((trade) => trade.symbol))].sort();
  const rounds: RoundTrip[] = [];
  for (const symbol of symbols) {
    rounds.push(...collectRoundTrips(kernelShaped.filter((trade) => trade.symbol === symbol)));
  }
  const wins = rounds.filter((round) => round.return > 0);
  const losses = rounds.filter((round) => round.return < 0);
  const winRate = rounds.length > 0 ? wins.length / rounds.length : null;
  let profitLossRatio: number | null;
  if (losses.length === 0) {
    profitLossRatio = null;
  } else if (wins.length === 0) {
    profitLossRatio = 0;
  } else {
    const avgWin = wins.reduce((sum, round) => sum + round.return, 0) / wins.length;
    const avgLoss = losses.reduce((sum, round) => sum + Math.abs(round.return), 0) / losses.length;
    profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : null;
  }
  return { ...base, winRate, profitLossRatio, roundTripCount: rounds.length };
}
