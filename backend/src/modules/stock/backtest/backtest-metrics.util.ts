// 回测绩效指标纯函数（方案 §2.6）。全部公式口径在此显式声明，单测以构造序列整数期望锁定，
// e2e 用手写独立算式验管线（不 import 本模块），不循环自证。无 I/O、不依赖 Nest 容器。
import { BacktestMetrics, EquityPoint, TradeRecord } from './backtest.types';

/** 年化天数（A 股交易日惯例口径）。导出供测试。 */
export const ANNUAL_DAYS = 252;

/** 空曲线/退化输入的零值指标。 */
const zeroedMetrics = (tradeCount: number, roundTripCount: number): BacktestMetrics => ({
  totalReturn: 0,
  annualizedReturn: 0,
  maxDrawdown: 0,
  longestDrawdownDays: 0,
  sharpe: 0,
  calmar: null,
  winRate: null,
  profitLossRatio: null,
  turnover: 0,
  tradeCount,
  roundTripCount
});

/** 回合（round trip）：一次 filled 买入与其后最近一次 filled 卖出配对（清仓语义下天然一一配对）。 */
interface RoundTrip {
  /** 回合收益率 = 卖出净所得/买入净成本 − 1（净=含费含滑点）。 */
  return: number;
}

const collectRoundTrips = (trades: TradeRecord[]): RoundTrip[] => {
  const rounds: RoundTrip[] = [];
  let openBuyCost: number | null = null; // 买入净成本（gross+fee）
  for (const trade of trades) {
    if (trade.status !== 'filled') {
      continue; // skipped 无 gross/fee，天然排除
    }
    if (trade.signalAction === 'buy') {
      openBuyCost = (trade.gross ?? 0) + (trade.fee ?? 0);
    } else if (openBuyCost != null && openBuyCost > 0) {
      const sellNet = (trade.gross ?? 0) - (trade.fee ?? 0);
      rounds.push({ return: sellNet / openBuyCost - 1 });
      openBuyCost = null;
    }
  }
  return rounds;
};

/**
 * 指标计算。口径（E_0..E_N 为净值点，N=点数−1 交易日跨度，日收益 r_t=E_t/E_{t-1}−1）：
 * 1. totalReturn = E_N/E_0 − 1
 * 2. annualizedReturn = (1+totalReturn)^(252/N) − 1；totalReturn≤−1 → −1；N=0 → 0
 * 3. maxDrawdown = max_t(1 − E_t/max_{s≤t}E_s)；无回撤 → 0
 * 4. longestDrawdownDays：净值创新高（含持平）处更新 lastPeakIdx，E_t<peak 时候选 t−lastPeakIdx，
 *    取 max；交易日数口径；期末未恢复（ongoing）计入
 * 5. sharpe = mean(r)/std(r)×√252；std 为总体标准差（÷N，非样本口径）；收益数<2 或 std=0 → 0；
 *    无风险利率 0（MVP 声明）
 * 6. calmar = maxDrawdown>0 ? annualizedReturn/maxDrawdown : null
 * 7/8. 胜率/盈亏比按已平仓回合：盈利=r>0、亏损=r<0（r=0 两者均不算）；无回合 winRate=null；
 *    无亏损回合 profitLossRatio=null；有亏损无盈利 → 0
 * 9. turnover = Σ_filled(gross) / (mean(E) × (N/252))，年化单边；N=0 或 mean(E)=0 → 0
 * 10. tradeCount=filled 笔数（skipped 不计入）；roundTripCount=已平仓回合数
 */
export function computeMetrics(
  equityCurve: EquityPoint[],
  trades: TradeRecord[],
  _initialCash: number
): BacktestMetrics {
  const filledCount = trades.filter((t) => t.status === 'filled').length;
  const rounds = collectRoundTrips(trades);
  if (equityCurve.length < 2) {
    return zeroedMetrics(filledCount, rounds.length);
  }

  const equities = equityCurve.map((p) => p.equity);
  const first = equities[0];
  const last = equities[equities.length - 1];
  const span = equities.length - 1; // N：交易日跨度

  // 1. 总收益率
  const totalReturn = first !== 0 ? last / first - 1 : 0;

  // 2. 年化收益
  let annualizedReturn: number;
  if (span === 0) {
    annualizedReturn = 0;
  } else if (totalReturn <= -1) {
    annualizedReturn = -1;
  } else {
    annualizedReturn = Math.pow(1 + totalReturn, ANNUAL_DAYS / span) - 1;
  }

  // 3/4. 最大回撤与最长回撤天数（逐点单遍扫描；峰值在创新高或持平处更新）
  let peak = first;
  let lastPeakIdx = 0;
  let maxDrawdown = 0;
  let longestDrawdownDays = 0;
  for (let i = 0; i < equities.length; i += 1) {
    const value = equities[i];
    if (value >= peak) {
      peak = value;
      lastPeakIdx = i;
    } else if (peak > 0) {
      maxDrawdown = Math.max(maxDrawdown, 1 - value / peak);
      longestDrawdownDays = Math.max(longestDrawdownDays, i - lastPeakIdx);
    }
  }

  // 5. 夏普（总体标准差口径）
  const returns: number[] = [];
  for (let i = 1; i < equities.length; i += 1) {
    returns.push(equities[i - 1] !== 0 ? equities[i] / equities[i - 1] - 1 : 0);
  }
  let sharpe = 0;
  if (returns.length >= 2) {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length; // 总体口径 ÷N
    const std = Math.sqrt(variance);
    if (std > 0) {
      sharpe = (mean / std) * Math.sqrt(ANNUAL_DAYS);
    }
  }

  // 6. 卡玛
  const calmar = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : null;

  // 7/8. 胜率与盈亏比
  const wins = rounds.filter((r) => r.return > 0);
  const losses = rounds.filter((r) => r.return < 0);
  const winRate = rounds.length > 0 ? wins.length / rounds.length : null;
  let profitLossRatio: number | null;
  if (losses.length === 0) {
    profitLossRatio = null;
  } else if (wins.length === 0) {
    profitLossRatio = 0;
  } else {
    const avgWin = wins.reduce((sum, r) => sum + r.return, 0) / wins.length;
    const avgLoss = losses.reduce((sum, r) => sum + Math.abs(r.return), 0) / losses.length;
    profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : null;
  }

  // 9. 年化换手率（买卖双侧各计一次——每笔成交 gross 全计入，非「单边减半」口径，同名指标与单边口径可差 2 倍；
  //    Σgross 只累计 filled——skipped 的 gross 恒 null 天然排除）
  const grossSum = trades.reduce((sum, t) => sum + (t.status === 'filled' ? t.gross ?? 0 : 0), 0);
  const equityMean = equities.reduce((sum, e) => sum + e, 0) / equities.length;
  const turnover = span > 0 && equityMean > 0 ? grossSum / (equityMean * (span / ANNUAL_DAYS)) : 0;

  return {
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    longestDrawdownDays,
    sharpe,
    calmar,
    winRate,
    profitLossRatio,
    turnover,
    tradeCount: filledCount,
    roundTripCount: rounds.length
  };
}
