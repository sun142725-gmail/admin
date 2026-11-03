// 股票回测内核 API 封装（照 api/dailyBars.ts 范式，http 实例统一解包 { code, message, data }）。
// 权限挂宿主页 stock:screener:use（回测 Tab 挂 /stock/screener 页第 4 个 Tab，无新增权限码/资源）。
// 类型与后端 backend/src/modules/stock/backtest/backtest.types.ts 及 RunBacktestDto 契约逐字段镜像；
// 请求体刻意无 signals 字段（防未来函数：信号只由服务端 maCrossDemoSignals 生成，HTTP 层不接受外部信号数组）。
import http from './http';

// ==================== 回显/结果类型（镜像 backtest.types.ts） ====================

// 单根 K 线：与日线行情库一致，OHLC 为前复权 qfq（stock-daily-bar.entity.ts 复权口径声明），
// volume 为手且 0=停牌占位，amount 为元（原始口径）。
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

// 信号：date=T 日（信号产生日），成交在 T+1 开盘——信号只由服务端内置演示信号生成。
export interface Signal {
  date: string;
  action: SignalAction;
}

export type TradeStatus = 'filled' | 'skipped';

// 跳过原因码（与后端 SkipReason 联合类型一致）
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

// 逐笔交易记录。字段语义（v3 契约钉死）：
//   tradeDate/price 与 T+1 bar 同构——T+1 bar 存在即恒=该 bar 日期/open（filled 与一切 skipped 一致，
//   suspended（volume=0）亦然），仅 no_next_bar 双 null；
//   filledPrice/gross/fee 仅 filled 有值、skipped 恒 null；shares filled≥100 整手、skipped 恒 0；
//   cashAfter/positionAfter/lastBuyTradeDate=该记录生成时的账户快照（skipped=不变快照，同日先成交信号已反映）。
export interface TradeRecord {
  signalDate: string;
  signalAction: SignalAction;
  status: TradeStatus;
  tradeDate: string | null;
  price: number | null;
  filledPrice: number | null;
  shares: number;
  gross: number | null;
  fee: number | null;
  cashAfter: number;
  positionAfter: number;
  lastBuyTradeDate: string | null;
  // 响应契约恒含的字段（filled 行恒为 null，skipped 行为跳过原因码；未知码由
  // skipReasonTagMeta 兜底回显原码）。宽泛 string 容忍后端新增码。
  skipReason?: string;
}

// 净值曲线逐交易日一点。记账时点：T 日净值 = T+1 开盘成交结算后的现金 + 持仓×T 日收盘
// （即 T 日净值已反映次日开盘成交）；停牌日无 bar 不产生点（序列与 bar 序列对齐）。
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

// 回测生效配置回显（报告页口径声明区直接展示实际生效参数）
export interface BacktestConfig {
  initialCash: number;
  limitUpPct: number;
  limitDownPct: number;
  limitEps: number;
  cost: CostConfig;
}

// 绩效指标。计数口径（v3）：tradeCount=filled 笔数（skipped 不计入）、roundTripCount=已平仓回合数；
// calmar/winRate/profitLossRatio 可为 null（无回撤/无回合/无亏损回合），前端显示 --。
export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  longestDrawdownDays: number;
  sharpe: number;
  calmar: number | null;
  winRate: number | null;
  profitLossRatio: number | null;
  turnover: number;
  tradeCount: number;
  roundTripCount: number;
}

export interface BacktestResult {
  equityCurve: EquityPoint[];
  trades: TradeRecord[];
  metrics: BacktestMetrics;
  config: BacktestConfig;
}

// POST /stock/backtest/run 响应 data：BacktestResult + 数据区间概览（symbol/barsCount/firstDate/lastDate）。
// 是 BacktestResult 的超集，调用方按 BacktestResult 消费亦类型兼容。
export interface BacktestRunResult extends BacktestResult {
  symbol: string;
  barsCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

// ==================== 请求体（镜像 RunBacktestDto：除 symbol 必填外均可选带默认值） ====================

export interface RunBacktestCostPayload {
  /** 默认 0.0003，≥0 */
  commissionRate?: number;
  /** 默认 5，≥0 */
  minCommission?: number;
  /** 默认 0.0005，[0, 0.05] */
  stampTaxRate?: number;
  /** 默认 0.001，[0, 0.05]（买贵卖便宜） */
  slippageRate?: number;
}

export type PositionModelType = 'all-in' | 'fixed-ratio' | 'atr';

export interface RunBacktestPositionModelPayload {
  type: PositionModelType;
  /** fixed-ratio 必填，(0, 1]：budget=min(equity*ratio, cash) */
  ratio?: number;
  /** atr 默认 0.01，(0, 0.1]：单股风险预算占权益比 */
  riskPct?: number;
  /** atr 默认 1，(0, 1]：仓位上限占权益比 */
  maxPositionPct?: number;
  /** atr 默认 14，[2, 60]：ATR 回看周期 */
  atrPeriod?: number;
}

export interface RunBacktestPayload {
  /** 必填，半角小写 ^(sh|sz)\d{6}$（大写/全角 422） */
  symbol: string;
  /** 默认 100000，>0 */
  initialCash?: number;
  /** 默认 500，10~2000：取库内末 N 根 */
  limit?: number;
  /** 默认 0.10，(0, 0.5]：涨停阈值（请求级单一阈值，不分板块/历史制度） */
  limitUpPct?: number;
  /** 默认 -0.10，[-0.5, 0) */
  limitDownPct?: number;
  /**
   * 默认 5e-3，[0, 5e-3]：档位缺口容差。交易所涨停价=round(前收×(1+阈值), 0.01) 使真实涨停比率
   * 低于名义阈值（3.01→0.099668、2.52→0.099206），5e-3 覆盖原始价 ≥1 元全部档位；
   * eps 相对阈值过大时判定带侵占阈值带，参数合理性由调用方负责（后端不做跨字段校验）。
   */
  limitEps?: number;
  cost?: RunBacktestCostPayload;
  positionModel?: RunBacktestPositionModelPayload;
}

// 运行回测：@HttpCode(200) 查询语义；权限 stock:screener:use（JwtAuthGuard+PermissionsGuard）。
// 校验失败/库内 bars<2 → 422（服务层 BadRequestException 经全局过滤器映射，文案直显）。
export const runBacktest = async (payload: RunBacktestPayload): Promise<BacktestRunResult> =>
  http.post<never, BacktestRunResult>('/stock/backtest/run', payload);
