// 策略插件化+模拟盘 API 封装（照 api/backtest.ts 范式，http 实例统一解包 { code, message, data }）。
// 权限：管理端组（列表/详情/CRUD/运行/回测，契约第 1~7 条）挂新权限码 stock:strategy:manage
// （SQL+seed 双通道 upsert，菜单可见性由 resources 表驱动）；watchlist-tags（第 8 条）仅 JwtAuthGuard。
// 类型与后端契约逐字段镜像；请求体刻意无 signals 字段（防未来函数：信号只由服务端策略模板
// generateSignals 生成，HTTP 层不接受外部信号数组，照 backtest.ts 头注声明）。
// 注意：STRATEGY_PARAM_FIELDS 与 pages/stock/strategyUI.ts 的 PARAM_FIELDS 为同源双表
// （strategyUI 照 backtestUI 范式仅 import type，无法复用本表），改任一侧必须同步另一侧。
import http from './http';
import type {
  BacktestConfig,
  BacktestMetrics,
  BacktestRunResult,
  EquityPoint,
  RunBacktestCostPayload,
  RunBacktestPositionModelPayload,
  SignalAction,
  SkipReason,
  TradeRecord
} from './backtest';

// ==================== 模板与参数 schema（镜像后端模板注册表，驱动动态表单） ====================

export type StrategyTemplate = 'ma-cross' | 'macd' | 'donchian' | 'etf-momentum';

export const STRATEGY_TEMPLATES: StrategyTemplate[] = ['ma-cross', 'macd', 'donchian', 'etf-momentum'];

// 单参数项：name/min/max/default 与后端模板 validateParams 白名单一致（越界 422 文案直显）。
export interface StrategyParamField {
  name: string;
  min: number;
  max: number;
  default: number;
  help: string;
}

// 跨参数约束（后端 validateParams 校验，前端提交前同口径前置提示）：
// ma-cross fastN<slowN / macd short<long / donchian exitN≤entryN / etf-momentum 见 symbols 约束。
export const STRATEGY_PARAM_FIELDS: Record<StrategyTemplate, StrategyParamField[]> = {
  'ma-cross': [
    { name: 'fastN', min: 2, max: 60, default: 5, help: '快线周期，须 < slowN' },
    { name: 'slowN', min: 3, max: 120, default: 20, help: '慢线周期，须 > fastN' }
  ],
  macd: [
    { name: 'short', min: 2, max: 60, default: 12, help: '快线 EMA 周期，须 < long' },
    { name: 'long', min: 3, max: 120, default: 26, help: '慢线 EMA 周期，须 > short' },
    { name: 'signal', min: 2, max: 60, default: 9, help: 'DEA 信号周期' }
  ],
  donchian: [
    { name: 'entryN', min: 5, max: 120, default: 20, help: '突破入场通道（前 entryN 根不含当日最高），须 ≥ exitN' },
    { name: 'exitN', min: 3, max: 60, default: 10, help: '破位离场通道（前 exitN 根不含当日最低），须 ≤ entryN' },
    { name: 'atrPeriod', min: 2, max: 60, default: 14, help: 'ATR 仓位插件回看周期' }
  ],
  'etf-momentum': [
    { name: 'lookbackN', min: 5, max: 120, default: 20, help: '动量分回看交易日数' },
    { name: 'holdTop', min: 1, max: 2, default: 1, help: '持仓排名前 N（等权分槽）' },
    { name: 'rebalanceDays', min: 1, max: 60, default: 5, help: '调仓周期（基准日历交易日序数取模）' }
  ]
};

// ==================== 状态码（镜像后端状态机与 skip 码集） ====================

export type SignalStatus = 'emitted' | 'filled' | 'skipped';

export type PositionStatus = 'flat' | 'pending_open' | 'holding' | 'pending_close';

// 策略信号（镜像后端 strategy.types.ts StrategySignal）：date=T 信号日，成交 T+1 开盘（内核同语义）。
// 仅作契约镜像——信号只由服务端 generateSignals 生成，前端任何请求体都不携带该结构（防未来函数）。
export interface StrategySignal {
  date: string;
  symbol: string;
  action: SignalAction;
}

// 内核 SkipReason 九码 + 组合层扩展码 no_bar（信号日该标的 bar 序列缺失——真实停牌常整行无 bar，
// 由重放器显式记录不静默丢弃；volume=0 占位行仍走 suspended）。宽泛 string 容忍后端新增码。
export type PortfolioSkipReason = SkipReason | 'no_bar';

// ==================== 配置/账户/信号/持仓条目 ====================

// 账户快照：列表项 account 为摘要子集（cash/equity/marketValue/lastRunStatus），
// 详情与 run 返回可能带 lastRunError/replayedThrough——后两项可选以同时兼容两处响应。
// 盯市日期口径在持仓行（positions[].lastMarkDate），账户表无该列，勿在此声明。
export interface StrategyAccountSummary {
  cash: number;
  equity: number;
  marketValue: number;
  lastRunStatus: 'ok' | 'failed' | null;
  lastRunError?: string | null;
  replayedThrough?: string | null;
}

// 策略配置行：列表 items 与详情 config 同构；account/latestSignalCount 仅列表回填（可选）。
// params 为后端「JSON 列 ?? 模板 defaultParams 合并」后的生效参数（键集=模板参数白名单）。
export interface StrategyConfigItem {
  id: number;
  name: string;
  template: StrategyTemplate;
  enabled: boolean;
  symbols: string[];
  params: Record<string, number>;
  initialCash: number;
  positionModel: RunBacktestPositionModelPayload | null;
  /** 重放正式段起点 YYYY-MM-DD（影子账户口径：改配置后下轮全量重建投影）。 */
  simStartDate: string;
  remark: string | null;
  account?: StrategyAccountSummary | null;
  latestSignalCount?: number;
}

// 模拟盘信号行（stock_strategy_signals 投影）。skipReason 码集=内核 SkipReason+no_bar，
// 仅 skipped 行有值；filledPrice/shares/fee 仅 filled 行有值（emitted 行待撮合全空）。
export interface StrategySignalItem {
  tradeDate: string;
  symbol: string;
  action: SignalAction;
  status: SignalStatus;
  skipReason: string | null;
  filledPrice: number | null;
  shares: number;
  fee: number | null;
}

// 模拟盘持仓行（stock_strategy_positions 投影）。last_buy_date 可早于 sim_start_date
// （预热段建仓，影子账户口径，UI 无需特殊处理照常展示）。
export interface StrategyPositionItem {
  symbol: string;
  status: PositionStatus;
  shares: number;
  avgCost: number | null;
  lastBuyDate: string | null;
  lastMarkDate: string | null;
  lastPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
}

// ==================== 响应信封 ====================

export interface StrategyListResult {
  items: StrategyConfigItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StrategyDetail {
  config: StrategyConfigItem;
  account: StrategyAccountSummary | null;
  positions: StrategyPositionItem[];
  recentSignals: StrategySignalItem[];
}

// POST /stock/strategy/:id/run 响应 data：手动模拟盘运行（定时手动共用 execute）。
export interface RunStrategyResult {
  signalsUpserted: number;
  positionsUpdated: number;
  account: StrategyAccountSummary | null;
  /** 重放至库内最新 bar 日（YYYY-MM-DD）；当日 K 线未落库时为库内最新交易日。 */
  replayedThrough: string | null;
}

// 组合层净值点：内核 EquityPoint + 组合市值（轮动专用）。
export interface PortfolioEquityPoint extends EquityPoint {
  marketValue: number;
}

// 组合层逐笔：单标的 TradeRecord 全字段 + symbol 维度。TS 接口扩展不能换型父属性，
// Omit 后重声明（照后端 PortfolioTradeRecord 同款处理）；skipReason 同宽泛 string 容忍新增码。
export interface PortfolioTradeRecord extends Omit<TradeRecord, 'skipReason'> {
  symbol: string;
  skipReason?: string;
}

// POST /stock/strategy/:id/backtest 轮动响应 data（契约第 7 条）：BacktestResult 超集——
// trades 带 symbol、equityCurve 带 marketValue、symbols[] 替代 symbol；
// metrics 的 winRate/profitLossRatio/roundTripCount 为按 symbol 分组配对口径（equity 类指标
// 复用内核 computeMetrics 公式）。r4 注明：轮动调仓序数锚日=max(simStartDate, 本次窗口首日)，
// limit 截断（末 N 根语义）使窗口首日晚于 simStartDate 时相位与模拟盘可能不一致——
// 回测为报告口径，撮合路径与模拟盘一致。
export interface PortfolioBacktestRunResult {
  symbols: string[];
  barsCount: number;
  firstDate: string | null;
  lastDate: string | null;
  equityCurve: PortfolioEquityPoint[];
  trades: PortfolioTradeRecord[];
  metrics: BacktestMetrics;
  config: BacktestConfig;
}

// 回测端点响应：单标的模板=内核 BacktestRunResult 原样（报告组件零改动）；轮动=组合超集。
export type StrategyBacktestResponse = BacktestRunResult | PortfolioBacktestRunResult;

// GET /stock/strategy/watchlist-tags 响应 data：启用策略对标的在「近 5 个 bar 日窗口」内的
// 最新信号（仅 status∈('emitted','filled')，skipped 含 no_bar 不返回；停用策略不返回）。
export interface StrategyWatchlistTagItem {
  symbol: string;
  date: string;
  action: SignalAction;
  strategyId: number;
  strategyName: string;
}

// ==================== 请求体（镜像 CreateRoundtableDto / BacktestPositionModelDto 同构契约） ====================

export interface CreateStrategyPayload {
  /** 1~64 必填，重名 422 */
  name: string;
  template: StrategyTemplate;
  /** 模板参数（键集=模板参数白名单，越界/未知键 422） */
  params?: Record<string, number>;
  /** ^(sh|sz)\d{6}$ ≤8 个；单标的模板恰 1 个 / 轮动 ≥2 个 */
  symbols?: string[];
  /** >0 默认 100000 */
  initialCash?: number;
  /** 镜像 BacktestPositionModelDto */
  positionModel?: RunBacktestPositionModelPayload;
  /** 重放正式段起点 YYYY-MM-DD */
  simStartDate?: string;
  /** ≤255 */
  remark?: string;
}

// PUT 全字段可选 + enabled 开关；返回 warning 为 UX 提示「下轮按新口径全量重建投影」。
export type UpdateStrategyPayload = Partial<CreateStrategyPayload> & { enabled?: boolean };

export interface RunStrategyBacktestPayload {
  /** 默认 500，10~2000：取库内末 N 根（末 N 根语义，窗口首日可能晚于 simStartDate） */
  limit?: number;
  cost?: RunBacktestCostPayload;
  positionModel?: RunBacktestPositionModelPayload;
}

// ==================== 接口封装（管理端组：stock:strategy:manage） ====================

export const createStrategy = (payload: CreateStrategyPayload) =>
  http.post<never, { id: number }>('/stock/strategy', payload);

export const listStrategies = (params?: {
  page?: number;
  pageSize?: number;
  template?: StrategyTemplate;
  enabled?: boolean;
}) => http.get<never, StrategyListResult>('/stock/strategy', { params });

export const getStrategy = (id: number) => http.get<never, StrategyDetail>(`/stock/strategy/${id}`);

export const updateStrategy = (id: number, payload: UpdateStrategyPayload) =>
  http.put<never, { id: number; warning?: string }>(`/stock/strategy/${id}`, payload);

export const deleteStrategy = (id: number) => http.delete<never, { id: number }>(`/stock/strategy/${id}`);

// 手动模拟盘运行：@HttpCode(200)；停用 422 / bars 不足 422 / 窗口超上限由 accounts.last_run_error 承载；
// 幂等：同日重跑信号行数不变（经济折叠消费全窗口事件，信号行落库按 trade_date>=sim_start_date 过滤）。
export const runStrategy = (id: number) => http.post<never, RunStrategyResult>(`/stock/strategy/${id}/run`);

// 策略回测：@HttpCode(200)。单标的=内核契约原样；轮动=PortfolioBacktestRunResult。
// 模拟盘与圆桌摘要成本固定 DEFAULT_COST，回测端点可经 cost/positionModel 覆盖。
export const backtestStrategy = (id: number, payload?: RunStrategyBacktestPayload) =>
  http.post<never, StrategyBacktestResponse>(`/stock/strategy/${id}/backtest`, payload ?? {});

// ==================== 接口封装（登录用户组：仅 JwtAuthGuard） ====================

// 自选股策略信号标签：≤100 个代码（超出 422）。「近 5 交易日」口径=该 symbol 日线库最近 5 个
// bar 日窗口（停牌缺日自然顺延）；仅 emitted/filled；停用策略不返回。
export const getWatchlistTags = (symbols: string[]) =>
  http.get<never, { items: StrategyWatchlistTagItem[] }>('/stock/strategy/watchlist-tags', {
    params: { symbols: symbols.join(',') }
  });
