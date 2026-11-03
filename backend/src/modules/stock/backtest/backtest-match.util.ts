// 撮合内核（方案 §2.5）：T 日信号 → T+1 开盘价成交（滑点后）的唯一成交路径，无同日成交路径。
// 防未来函数是结构性的：内核只存在「查表取 T 的下一根 bar 的 open」一条成交路径。
// 纯函数：无 I/O、不依赖 Nest 容器、不 import @nestjs/*。
import { atr } from '../indicators.util';
import { buyFee, fillPrice, sellFee } from './backtest-cost.util';
import { PositionModel } from './backtest-sizing.util';
import {
  Bar,
  BacktestConfig,
  BacktestResult,
  EquityPoint,
  Signal,
  SkipReason,
  TradeRecord,
  TradeStatus
} from './backtest.types';
import { computeMetrics } from './backtest-metrics.util';

/** 默认配置：初始资金 10 万 / 涨跌停阈值 ±10% / 档位缺口容差 5e-3 / 默认成本。 */
export const DEFAULT_CONFIG: BacktestConfig = {
  initialCash: 100000,
  limitUpPct: 0.10,
  limitDownPct: -0.10,
  limitEps: 5e-3,
  cost: {
    commissionRate: 0.0003,
    minCommission: 5,
    stampTaxRate: 0.0005,
    slippageRate: 0.001
  }
};

/**
 * 涨跌停判定口径（比率口径 + limitEps 档位缺口容差，默认 5e-3）：
 *   openT1/prevClose − 1 >= limitUpPct − eps 视为一字涨停不买；<= limitDownPct + eps 一字跌停不卖。
 * 理由与局限（如实声明）：交易所涨停价 = round(前收×(1+阈值), 0.01)，四舍五入使真实涨停比率可
 * 低于名义阈值（低价股档位缺口，实算 3.01→0.099668、2.52→0.099206，无容差必然漏判、方向=高估
 * 可成交性→收益虚高）；比率在前复权缩放下不变（复权安全）但不消除档位缺口；整数分枚举全扫
 * 原始价 [1,100] 元：涨停侧最大缺口 0.004348（@1.15）、跌停侧最大偏差 0.004762（@1.05），
 * eps=5e-3 覆盖原始价 ≥1 元的全部档位并留余量。偏差方向：容差消除可成交性虚高（方向性错误）；
 * eps 边界带内的假阳性（真实未封死的 ±9.5%~10% 开盘被放弃）对收益的影响方向不定，不承诺单调。
 * 原始价 <1 元的极端档位（A 股正常交易不存在）仍可能漏判。eps 相对阈值过大时判定带侵占阈值带
 * （参数化责任归调用方，见 run-backtest.dto.ts 注释）。触发即整笔放弃、不递延 T+2（MVP 简化口径）。
 */

/**
 * 同日多信号的处理顺序：按调用方给出的输入顺序逐条处理（稳定、不重排）。
 * 说明：方案伪代码写「sorted sell->buy（腾资金）」，但同日先卖后买排序会使 §6.1 必测项
 * 「同日先买后卖 → t_plus_1 skip（快照含先成交信号的现金变动）」结构性不可达（sell 先行时
 * 恒 no_position，t_plus_1 分支成为死代码）；按测试清单优先，实现为输入顺序处理——
 * 「先卖后买腾资金」由调用方按 [sell, buy] 顺序表达（内核如实保序），
 * 「先买后卖」则由 t_plus_1 检查兜底拒绝同开盘往返。内置演示信号每日至多一条，HTTP 路径不受影响。
 */

export interface RunBacktestInput {
  bars: Bar[];
  signals: Signal[];
  config: BacktestConfig;
  positionModel: PositionModel;
  /** ATR 预计算周期（indicators.util.atr，Wilder 平滑因果实现）；缺省 14。 */
  atrPeriod?: number;
}

/** 买入股数整手计算：floor(预算/(含佣每股成本)/100)×100；最低佣金致现金为负则逐手递减重试。 */
const computeBuyShares = (
  budget: number,
  filledPrice: number,
  cost: BacktestConfig['cost'],
  cash: number
): number => {
  const perShare = filledPrice * (1 + cost.commissionRate);
  let lots = Math.floor(budget / perShare / 100) * 100;
  const cashAfterBuy = (k: number) => cash - (k * filledPrice + Math.max(k * filledPrice * cost.commissionRate, cost.minCommission));
  while (lots >= 100 && cashAfterBuy(lots) < 0) {
    lots -= 100;
  }
  return lots;
};

export function runBacktest(input: RunBacktestInput): BacktestResult {
  const { bars, signals, config, positionModel } = input;
  const atrPeriod = input.atrPeriod ?? 14;
  const equityCurve: EquityPoint[] = [];
  const trades: TradeRecord[] = [];

  // 信号日查表：只接受 date 命中 bar 序列的信号（否则静默丢弃，不产生记录）。
  const dateIdx = new Map<string, number>();
  bars.forEach((bar, i) => dateIdx.set(bar.date, i));
  const sigByDate = new Map<string, Signal[]>();
  for (const sig of signals) {
    if (!dateIdx.has(sig.date)) {
      continue;
    }
    const list = sigByDate.get(sig.date) ?? [];
    list.push(sig);
    sigByDate.set(sig.date, list);
  }

  // ATR 序列一次预计算（indicators.util.atr：Wilder 平滑，atr[i] 只依赖 bars[0..i]，因果无未来）。
  const atrSeries = atr(
    bars.map((b) => b.high),
    bars.map((b) => b.low),
    bars.map((b) => b.close),
    atrPeriod
  );

  let cash = config.initialCash;
  let shares = 0;
  let lastBuy: string | null = null;

  /** 生成记录：tradeDate/price 与 T+1 bar 同构（bar 存在恒=该 bar 日期/open），仅 no_next_bar 双 null。 */
  const record = (
    sig: Signal,
    status: TradeStatus,
    skipReason: SkipReason | null,
    next: Bar | null,
    extra: { filledPrice?: number; shares?: number; gross?: number; fee?: number }
  ): void => {
    trades.push({
      signalDate: sig.date,
      signalAction: sig.action,
      status,
      skipReason,
      tradeDate: next ? next.date : null,
      price: next ? next.open : null,
      filledPrice: extra.filledPrice ?? null,
      shares: extra.shares ?? 0,
      gross: extra.gross ?? null,
      fee: extra.fee ?? null,
      cashAfter: cash,
      positionAfter: shares,
      lastBuyTradeDate: lastBuy
    });
  };

  for (let t = 0; t < bars.length; t += 1) {
    const next = t + 1 < bars.length ? bars[t + 1] : null;
    const daySignals = sigByDate.get(bars[t].date) ?? [];
    // 同日多信号按输入顺序处理（见函数头说明）；先结算成交再 push 当日净值点（记账时点口径）。
    for (const sig of daySignals) {
      if (next == null) {
        record(sig, 'skipped', 'no_next_bar', null, {});
        continue;
      }
      if (next.volume === 0) {
        // 停牌占位（stock-daily-bar.entity.ts:41）：不递延，tradeDate/price 仍=该停牌 bar。
        record(sig, 'skipped', 'suspended', next, {});
        continue;
      }
      const prevClose = bars[t].close;
      const ratio = prevClose > 0 ? next.open / prevClose - 1 : NaN;
      if (sig.action === 'buy') {
        if (shares > 0) {
          record(sig, 'skipped', 'already_holding', next, {});
          continue;
        }
        if (ratio >= config.limitUpPct - config.limitEps) {
          record(sig, 'skipped', 'limit_up', next, {});
          continue;
        }
        const ctxAtr = atrSeries[t] ?? null;
        if (positionModel.name === 'atr' && ctxAtr == null) {
          record(sig, 'skipped', 'atr_unavailable', next, {});
          continue;
        }
        const budget = positionModel.budget({
          equity: cash + shares * bars[t].close,
          cash,
          bar: bars[t],
          atr: ctxAtr,
          config
        });
        const filled = fillPrice(next.open, 'buy', config.cost.slippageRate);
        const lots = computeBuyShares(budget, filled, config.cost, cash);
        if (!(lots >= 100)) {
          // 含 NaN/负预算（模型放弃或资金不足）→ insufficient_funds
          record(sig, 'skipped', 'insufficient_funds', next, {});
          continue;
        }
        const gross = lots * filled;
        const fee = buyFee(gross, config.cost);
        cash -= gross + fee;
        shares = lots;
        lastBuy = next.date;
        record(sig, 'filled', null, next, { filledPrice: filled, shares: lots, gross, fee });
      } else {
        if (shares === 0) {
          record(sig, 'skipped', 'no_position', next, {});
          continue;
        }
        if (ratio <= config.limitDownPct + config.limitEps) {
          record(sig, 'skipped', 'limit_down', next, {});
          continue;
        }
        // T+1 可卖：lastBuy < 卖出成交日（严格，ISO 字典序即交易日序）；买入当日不可卖。
        if (!(lastBuy != null && lastBuy < next.date)) {
          record(sig, 'skipped', 't_plus_1', next, {});
          continue;
        }
        const filled = fillPrice(next.open, 'sell', config.cost.slippageRate);
        const gross = shares * filled;
        const fee = sellFee(gross, config.cost);
        cash += gross - fee;
        const soldShares = shares;
        shares = 0;
        lastBuy = null;
        record(sig, 'filled', null, next, { filledPrice: filled, shares: soldShares, gross, fee });
      }
    }
    // 记账时点：上面成交已按 T+1 open 结算现金/持仓，故 T 日净值已反映次日开盘成交
    //（口径声明：T 日净值 = （T+1 开盘成交后的现金）+ 持仓×T 日收盘）。停牌日无 bar 不产生点。
    equityCurve.push({
      date: bars[t].date,
      cash,
      shares,
      close: bars[t].close,
      equity: cash + shares * bars[t].close
    });
  }

  const metrics = computeMetrics(equityCurve, trades, config.initialCash);
  return { equityCurve, trades, metrics, config };
}
