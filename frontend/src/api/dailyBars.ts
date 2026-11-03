// 股票日线行情库 API 封装（照 api/screener.ts 范式，http 实例统一解包 { code, message, data }）。
// 权限挂宿主页 stock:screener:use（报表 Tab 挂 /stock/screener 页，无新增权限码/资源）。
import http from './http';

// 质量探针异常码联合类型（与后端 daily-bars-quality.util 四码一致）：
// zero_volume 零成交量（停牌占位）/ non_positive_price 非正价格 / high_low_inverted 高低点倒挂 / oc_out_of_range 开收越界
export type BarAnomalyCode = 'zero_volume' | 'non_positive_price' | 'high_low_inverted' | 'oc_out_of_range';

// 概览候选池筛选：all=自选∪候选池全宇宙 / watchlist=仅自选 / screener=仅候选池命中
export type BarsPoolFilter = 'all' | 'watchlist' | 'screener';

// 概览行：SQL GROUP BY 聚合结果（不做行级探针），name 取 watchlist/hits 冗余列，无则空串。
// firstDate/lastDate 可为 null：宇宙内标的尚未抓到任何 K 线（barCount=0）时后端返回 null
// （对齐后端 daily-bars.service.ts:78-79/:415-416 的 string | null）
export interface BarsQualityOverviewItem {
  symbol: string;
  name: string;
  barCount: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 今天-lastDate（UTC 日历日），>7 前端标警（staleDaysTagMeta 三态）；无数据时后端恒 0 */
  staleDays: number;
}

export interface BarsQualityUniverse {
  watchlistSymbols: number;
  screenerSymbols: number;
  barsTotal: number;
}

export interface BarsQualityOverview {
  universe: BarsQualityUniverse;
  total: number;
  items: BarsQualityOverviewItem[];
}

// 工作日缺口：按周一~五推断（无交易日历，法定长假会误报，前端固定提示 GAP_HINT_TEXT）
export interface BarsWeekdayGap {
  from: string;
  to: string;
  skippedWeekdays: number;
  /** 缺口起点早于自动补抓窗口下界（today−maxBars 日历天）：自动补抓够不着，需手动 full 重抓 */
  outsideAutoWindow: boolean;
}

// 单根 K 线异常行：一行可叠加多码（如 high_low_inverted + oc_out_of_range）
export interface BarsAnomalyItem {
  tradeDate: string;
  codes: BarAnomalyCode[];
}

// 疑似除权 seam 或脏数据：相邻 |close/prevClose-1|>阈值（默认 20%）
export interface BarsSuspiciousJump {
  tradeDate: string;
  pct: number;
}

export interface BarsQualityDetailItem {
  symbol: string;
  barCount: number;
  /** 空库标的（0 根）为 null（对齐后端 daily-bars-quality.util.ts:49-50/:154-155） */
  firstDate: string | null;
  lastDate: string | null;
  weekdayGaps: BarsWeekdayGap[];
  anomalies: BarsAnomalyItem[];
  suspiciousJumps: BarsSuspiciousJump[];
}

export interface BarsQualityDetail {
  items: BarsQualityDetailItem[];
}

export interface QueryBarsQualityOverviewParams {
  pool?: BarsPoolFilter;
  page?: number;
  pageSize?: number;
}

export const getBarsQualityOverview = (params?: QueryBarsQualityOverviewParams) =>
  http.get<never, BarsQualityOverview>('/stock/daily-bars/quality/overview', { params });

// symbols 必填：逗号分隔 1~20 个，逐个 ^(sh|sz)\d{6}$（违规 422）
export const getBarsQualityDetail = (symbols: string[]) =>
  http.get<never, BarsQualityDetail>('/stock/daily-bars/quality/detail', {
    params: { symbols: symbols.join(',') }
  });

export interface TriggerDailyBarsPayload {
  /** 缺省=全宇宙；显式传时 ≤50 个，逐个 ^(sh|sz)\d{6}$ */
  symbols?: string[];
  /** true=单标的全量重抓（先抓成功后删+事务）；定时增量路径绝不删行 */
  full?: boolean;
}

// 手动补抓：@HttpCode(200) 查询语义；后台执行无 run 表故不返回 runId（进度看后端日志）。
// 失败：test 环境 503；已有任务运行中 409；symbols 非法 422。
export const triggerDailyBarsBackfill = (payload: TriggerDailyBarsPayload) =>
  http.post<never, { started: boolean }>('/stock/daily-bars/trigger', payload);
