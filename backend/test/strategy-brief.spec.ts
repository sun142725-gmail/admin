// 策略圆桌简报纯函数单测（方案 §5/§9）：段落关键词、轮动分组配对口径声明、r4 预热段口径声明、
// 空数据降级。
import { renderStrategyBriefText, StrategyBriefParts } from '../src/modules/stock/strategy/strategy-brief.util';
import { BacktestMetrics } from '../src/modules/stock/backtest/backtest.types';

const metrics: BacktestMetrics = {
  totalReturn: -0.63,
  annualizedReturn: -0.9987,
  maxDrawdown: 0.6864,
  longestDrawdownDays: 3,
  sharpe: -0.41,
  calmar: -1.4548,
  winRate: 0,
  profitLossRatio: 0,
  turnover: 5.25,
  tradeCount: 2,
  roundTripCount: 1
};

const fullParts = (overrides: Partial<StrategyBriefParts> = {}): StrategyBriefParts => ({
  strategyName: '茅台双均线',
  templateLabel: '双均线交叉',
  params: { fastN: 5, slowN: 20 },
  symbols: ['sh600519'],
  simStartDate: '2026-08-01',
  enabled: true,
  metrics,
  barsRange: { firstDate: '2026-08-24', lastDate: '2026-09-29', barsCount: 27 },
  recentSignals: [
    { tradeDate: '2026-09-28', symbol: 'sh600519', action: 'sell', status: 'filled', skipReason: null },
    { tradeDate: '2026-09-21', symbol: 'sh600519', action: 'buy', status: 'filled', skipReason: null }
  ],
  positions: [
    {
      symbol: 'sh600519',
      status: 'flat',
      shares: 0,
      avgCost: null,
      lastPrice: 4,
      marketValue: 0,
      unrealizedPnl: null
    }
  ],
  account: {
    cash: 36806.5,
    equity: 36806.5,
    marketValue: 0,
    replayedThrough: '2026-09-29',
    lastRunStatus: 'ok',
    lastRunError: null
  },
  rotation: false,
  ...overrides
});

describe('renderStrategyBriefText', () => {
  it('contains strategy name / template / annualized / drawdown / latest signals / positions keywords', () => {
    const text = renderStrategyBriefText(fullParts());
    expect(text).toContain('茅台双均线');
    expect(text).toContain('双均线交叉');
    expect(text).toContain('年化');
    expect(text).toContain('-99.87%'); // annualizedReturn 手推格式化
    expect(text).toContain('最大回撤');
    expect(text).toContain('68.64%');
    expect(text).toContain('2026-09-28 sh600519 SELL [filled]');
    expect(text).toContain('持仓快照');
    expect(text).toContain('sh600519');
    expect(text).toContain('36806.50');
    expect(text).toContain('影子账户'); // 模拟盘口径声明
  });

  it('rotation mode declares per-symbol grouped round-trip pairing', () => {
    const text = renderStrategyBriefText(fullParts({ rotation: true }));
    expect(text).toContain('回合按标的分组配对');
  });

  it('always declares the r4 warmup folding scope (economic consequences counted, warmup rows not persisted)', () => {
    const text = renderStrategyBriefText(fullParts());
    expect(text).toContain('经济后果计入影子账户');
    expect(text).toContain('预热段信号行不落库');
    expect(text).toContain('日线收盘盯市');
  });

  it('degrades gracefully with empty positions/signals/account/metrics', () => {
    const text = renderStrategyBriefText(
      fullParts({
        metrics: null,
        barsRange: null,
        recentSignals: [],
        positions: [],
        account: null
      })
    );
    expect(text).toContain('暂无绩效数据');
    expect(text).toContain('暂无信号记录');
    expect(text).toContain('当前无持仓记录');
    expect(text).toContain('暂无账户投影');
    // 不含绩效数字段落（降级不抛错）
    expect(text).not.toContain('-99.87%');
  });
});
