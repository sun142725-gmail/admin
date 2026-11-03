// 回测成本模型纯函数（方案 §2.2）：滑点方向、买卖费用。无 I/O、不依赖 Nest 容器。
import { CostConfig, SignalAction } from './backtest.types';

/** 默认成本：佣金万 3（最低 5 元）/ 印花税万 5（卖出单边）/ 滑点千 1。 */
export const DEFAULT_COST: CostConfig = {
  commissionRate: 0.0003,
  minCommission: 5,
  stampTaxRate: 0.0005,
  slippageRate: 0.001
};

/**
 * 滑点后成交价：buy = open×(1+s)（买贵），sell = open×(1−s)（卖便宜）。
 * 方向声明：滑点永远对交易者不利。
 */
export function fillPrice(open: number, side: SignalAction, slippageRate: number): number {
  return side === 'buy' ? open * (1 + slippageRate) : open * (1 - slippageRate);
}

/** 买入费用 = max(amount×佣金率, 最低佣金）。 */
export function buyFee(amount: number, c: CostConfig): number {
  return Math.max(amount * c.commissionRate, c.minCommission);
}

/** 卖出费用 = max(amount×佣金率, 最低佣金) + amount×印花税率（卖出单边）。 */
export function sellFee(amount: number, c: CostConfig): number {
  return Math.max(amount * c.commissionRate, c.minCommission) + amount * c.stampTaxRate;
}
