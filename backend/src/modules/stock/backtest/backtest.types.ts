// 股票回测内核共享类型（方案 §2.1）。纯类型文件：不 import 任何运行时依赖（含 @nestjs/*），
// 供内核纯函数、服务层与 e2e 共用。
//
// 复权口径：与 stock_daily_bars 一致，OHLC 为前复权 qfq（stock-daily-bar.entity.ts:2-7 注释原文：
// 「OHLC 四列存前复权价（qfq，与行情软件同口径）」），由数据加载层保证；volume(手)/amount(元) 为原始口径。
// volume=0 是停牌占位（stock-daily-bar.entity.ts:41），撮合内核据此判 suspended。

/** 单根日 K（前复权 OHLC；volume 手、amount 元）。 */
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export type SignalAction = 'buy' | 'sell';

/** 信号：date=T 日（信号产生日），成交固定在 T+1 开盘（撮合内核唯一成交路径）。 */
export interface Signal {
  date: string;
  action: SignalAction;
}

export type TradeStatus = 'filled' | 'skipped';

export type SkipReason =
  | 'limit_up'
  | 'limit_down'
  | 'suspended'
  | 'no_next_bar'
  | 't_plus_1'
  | 'already_holding'
  | 'no_position'
  | 'insufficient_funds'
  | 'atr_unavailable';

export interface TradeRecord {
  signalDate: string;
  signalAction: SignalAction;
  status: TradeStatus;
  /** 放弃原因；filled 恒 null。 */
  skipReason: SkipReason | null;
  /**
   * 统一规则：T+1 bar 存在即恒=该 bar 日期（filled 与 skipped 一致，suspended/volume=0 亦然），
   * 仅 no_next_bar=null——e2e toEqual 依据。
   */
  tradeDate: string | null;
  /** 与 tradeDate 同构：T+1 bar 存在恒=该 bar open（filled/skipped 一致），仅 no_next_bar=null。 */
  price: number | null;
  /** 含滑点成交价；仅 filled 有值，skipped（含 no_next_bar）恒 null。 */
  filledPrice: number | null;
  /** filled 时 ≥100 且为 100 整数倍；skipped 恒 0。 */
  shares: number;
  /** shares×filledPrice；仅 filled 有值，skipped 恒 null。 */
  gross: number | null;
  /** 该笔全部费用（买入=佣金；卖出=佣金+印花税）；仅 filled 有值，skipped 恒 null。 */
  fee: number | null;
  /**
   * 账户快照：该记录生成时刻的当前值——filled=成交后值；skipped=不变快照（该信号未改动账户，
   * 同日先成交的信号已反映，如「先买后卖」中后到的 sell skip 看到的是买入后的现金）。
   */
  cashAfter: number;
  positionAfter: number;
  lastBuyTradeDate: string | null;
}

export interface EquityPoint {
  date: string;
  cash: number;
  shares: number;
  close: number;
  equity: number;
}

export interface CostConfig {
  commissionRate: number;
  minCommission: number;
  stampTaxRate: number;
  slippageRate: number;
}

export interface BacktestConfig {
  initialCash: number;
  limitUpPct: number;
  limitDownPct: number;
  limitEps: number;
  cost: CostConfig;
}

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  longestDrawdownDays: number;
  sharpe: number;
  /** maxDrawdown=0 → null（前端显示 --，避免 Infinity）。 */
  calmar: number | null;
  /** 无已平仓回合 → null。 */
  winRate: number | null;
  /** 无亏损回合 → null；有亏损无盈利 → 0。 */
  profitLossRatio: number | null;
  /** 年化换手率:买卖双侧各计一次(每笔成交 gross 全计入,与常见「单边」口径可差 2 倍)。 */
  turnover: number;
  /** filled 笔数（skipped 不计入）。 */
  tradeCount: number;
  /** 已平仓回合数（清仓语义下 = filled 卖出笔数）。 */
  roundTripCount: number;
}

export interface BacktestResult {
  equityCurve: EquityPoint[];
  trades: TradeRecord[];
  metrics: BacktestMetrics;
  config: BacktestConfig;
}
