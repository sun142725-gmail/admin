// 回测仓位模型插件（方案 §2.3）：统一接口只产出「买入预算（元）」；
// 股数整手取整、费用、现金约束统一在撮合内核（关注点分离，保证期望值可推演）。0=放弃买入。
// 无 I/O、不依赖 Nest 容器。
import { Bar, BacktestConfig } from './backtest.types';

export interface PositionContext {
  /** 当前总净值（现金 + 持仓×信号日收盘）。 */
  equity: number;
  /** 当前可用现金。 */
  cash: number;
  /** 信号日 bar（供模型读取收盘价等）。 */
  bar: Bar;
  /** 信号日 ATR（内核预计算序列取值；序列未成热值时为 null）。 */
  atr: number | null;
  config: BacktestConfig;
}

export interface PositionModel {
  name: 'all-in' | 'fixed-ratio' | 'atr';
  /** 返回买入预算（元）；0=放弃（撮合内核记 insufficient_funds，ATR 缺数据除外见 atrModel）。 */
  budget(ctx: PositionContext): number;
}

/** 全仓：预算 = 全部可用现金。 */
export const allInModel = (): PositionModel => ({
  name: 'all-in',
  budget: (ctx) => ctx.cash
});

/** 固定比例：预算 = min(净值×ratio, 现金)。ratio ∈ (0,1]。 */
export const fixedRatioModel = (ratio: number): PositionModel => ({
  name: 'fixed-ratio',
  budget: (ctx) => Math.min(ctx.equity * ratio, ctx.cash)
});

/**
 * ATR 风险预算：单股风险预算 = equity×riskPct，每股风险 ≈ 1×ATR，折算可买金额
 * = equity×riskPct/atr×bar.close，再受最大仓位 equity×maxPositionPct 与现金双重钳制。
 * atr=null → 0（撮合内核据此记 skipReason=atr_unavailable，区别于资金不足）。
 */
export const atrModel = (params: { riskPct: number; maxPositionPct: number }): PositionModel => ({
  name: 'atr',
  budget: (ctx) => {
    if (ctx.atr == null) {
      return 0;
    }
    return Math.min(
      (ctx.equity * params.riskPct) / ctx.atr * ctx.bar.close,
      ctx.equity * params.maxPositionPct,
      ctx.cash
    );
  }
});
