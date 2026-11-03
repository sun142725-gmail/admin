// 回测成本模型纯函数单测（不依赖网络与 Nest 容器，照 daily-bars-quality.util.spec.ts 范式）：
// 买卖滑点方向 / max 与最低佣金 / 卖出叠加印花税 / 全零恒等 / 默认成本常量。
import { buyFee, DEFAULT_COST, fillPrice, sellFee } from '../src/modules/stock/backtest/backtest-cost.util';
import { CostConfig } from '../src/modules/stock/backtest/backtest.types';

const ZERO_COST: CostConfig = {
  commissionRate: 0,
  minCommission: 0,
  stampTaxRate: 0,
  slippageRate: 0
};

describe('fillPrice（滑点方向：买贵卖便宜）', () => {
  it('①buy = open×(1+s)', () => {
    expect(fillPrice(10, 'buy', 0.001)).toBeCloseTo(10.01, 10);
  });

  it('②sell = open×(1−s)', () => {
    expect(fillPrice(10, 'sell', 0.001)).toBeCloseTo(9.99, 10);
  });

  it('③滑点为 0 恒等', () => {
    expect(fillPrice(11.5, 'buy', 0)).toBe(11.5);
    expect(fillPrice(11.5, 'sell', 0)).toBe(11.5);
  });
});

describe('buyFee（max 与最低佣金）', () => {
  it('④比例佣金高于最低佣金时取比例：99000×0.0003=29.7', () => {
    expect(buyFee(99000, DEFAULT_COST)).toBeCloseTo(29.7, 10);
  });

  it('⑤比例佣金低于最低佣金时取最低 5 元：1000×0.0003=0.3 < 5', () => {
    expect(buyFee(1000, DEFAULT_COST)).toBe(5);
  });

  it('⑥恰好等于最低佣金时取同值（max 边界）', () => {
    // amount×0.0003 = 5 → amount = 50000/3
    expect(buyFee(50000 / 3, DEFAULT_COST)).toBeCloseTo(5, 10);
  });
});

describe('sellFee（佣金 + 印花税叠加）', () => {
  it('⑦卖出费用 = max(比例, 最低) + 印花税：99000 → 29.7 + 49.5 = 79.2', () => {
    expect(sellFee(99000, DEFAULT_COST)).toBeCloseTo(79.2, 10);
  });

  it('⑧小额定金：最低佣金 + 印花税', () => {
    // max(0.3, 5) + 1000×0.0005 = 5 + 0.5 = 5.5
    expect(sellFee(1000, DEFAULT_COST)).toBeCloseTo(5.5, 10);
  });
});

describe('全零成本恒等', () => {
  it('⑨全零 config 下买卖费用均为 0', () => {
    expect(buyFee(99000, ZERO_COST)).toBe(0);
    expect(sellFee(36000, ZERO_COST)).toBe(0);
  });
});

describe('DEFAULT_COST 默认常量', () => {
  it('⑩默认值：佣金 0.0003 / 最低 5 / 印花税 0.0005 / 滑点 0.001', () => {
    expect(DEFAULT_COST).toEqual({
      commissionRate: 0.0003,
      minCommission: 5,
      stampTaxRate: 0.0005,
      slippageRate: 0.001
    });
  });
});
