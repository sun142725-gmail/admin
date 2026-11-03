// 日线行情库续抓校准纯函数（无 I/O，不依赖 Nest 容器，单测 test/daily-bars-calib.util.spec.ts）：
// UTC 归一 / 断点续抓拉取根数 / 写库切割与漂移校准重叠段 / 上游行二次防线剔除。
// 职责边界：解析与规则在这里；DB 与网络编排在 daily-bars.service.ts（薄封装不做单测，e2e 覆盖）。
import { KlineItem } from '../indicators.util';

/** 单根行情入库前的草稿行（klineToRow 产出，upsert 输入）。 */
export interface BarRowDraft {
  symbol: string;
  /** UTC 日期 'YYYY-MM-DD'（排序/配对键）。 */
  date: string;
  /** 交易日 UTC 零点。 */
  tradeDate: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

/** 复权漂移校准的最小行（只需日期与收盘）。 */
export interface DriftRow {
  date: string;
  close: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 'YYYY-MM-DD' → UTC 零点；非法串（格式不符/补零缺失/越界日期如 02-30）返回 null。
 * 严格半角格式：'2026-2-3' 拒绝（补零是入库口径的一部分，宽松解析会静默错位）。
 */
export function toUtcMidnight(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // 越界日期（2026-02-30 等）会被 Date 静默滚动到下月：回写比对拒绝。
  return isoDay(date) === iso ? date : null;
}

/** Date → UTC 'YYYY-MM-DD'。 */
export function isoDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 断点续抓拉取根数：锚点取「最新落库日」与「最早中段缺口锚点」中更早者，
 * 窗口 = 锚点 → 今天的日历天数 + bufferDays（buffer 兜底短线缺口），下限 bufferDays、上限 maxBars。
 * 首抓（两者皆 null，无任何锚点）= initBars。
 * today ≤ 锚点（时钟回拨/锚点在未来）防御返回 bufferDays。
 */
export function computeFetchLimit(
  latestIso: string | null,
  earliestGapIso: string | null,
  today: Date,
  initBars: number,
  maxBars: number,
  bufferDays: number
): number {
  if (latestIso == null && earliestGapIso == null) {
    return initBars;
  }
  const anchors = [latestIso, earliestGapIso].filter((iso): iso is string => iso != null);
  // 更早者扩窗：缺口锚点早于 latest 时窗口按缺口扩（computeFetchLimit 的核心语义）
  const anchorIso = anchors.sort()[0];
  const anchor = toUtcMidnight(anchorIso);
  if (!anchor) {
    return initBars;
  }
  const today0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const spanDays = Math.floor((today0.getTime() - anchor.getTime()) / DAY_MS);
  if (spanDays <= 0) {
    return bufferDays;
  }
  const limit = spanDays + bufferDays;
  return Math.min(Math.max(limit, Math.min(bufferDays, maxBars)), maxBars);
}

/** 拉取窗口「根数 → 日历天」保守换算因子：周末 7 天只开 5 天（5/7 的倒数 ≈1.4）；
 *  法定节假日只会让真实回看跨度更大，换算值 ≤ 真实跨度 → 窗口外判定保持保守（宁多提示手动 full，
 *  绝不把够得着的缺口漏标成「自动可回补」）。 */
export const BARS_TO_CALENDAR_FACTOR = 1.4;

/** 根数 → 日历天（向上取整）：质量探针 outsideAutoWindow 窗口与拉取窗口的单位对齐用——
 *  上游按「根数」取数（250 根实际回看 ≈350+ 日历天），探针直接拿根数当日历天会把
 *  ~250-355 天带内本可自动回补的缺口误标「窗口外」（评审意见 3 的单位混用根因）。 */
export function barsToCalendarDays(bars: number): number {
  return Math.ceil(bars * BARS_TO_CALENDAR_FACTOR);
}

/**
 * 续抓切割（R2 语义）：
 * - upserts = 拉取窗口内全部合法行（含中段缺口行与最新一根）——唯一键 (symbol, trade_date) 幂等安全写，
 *   中段历史缺口随窗口重拉自动回填，最新一根重写以修正收盘结算；
 * - overlapFetched = latestStored 之前最近 overlapBars 根（不写库，仅供 computeAdjustDrift
 *   与 DB 写前快照按日期配对）。
 * 输入乱序先排序；同日重复行取后到者（上游畸形响应防御）。
 */
export function splitBarsForUpsert(
  items: BarRowDraft[],
  latestStoredIso: string | null,
  overlapBars: number
): { upserts: BarRowDraft[]; overlapFetched: BarRowDraft[] } {
  const byDate = new Map<string, BarRowDraft>();
  for (const item of items) {
    byDate.set(item.date, item); // 排序去重：同日后者覆盖前者
  }
  const sorted = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const upserts = sorted;
  let overlapFetched: BarRowDraft[] = [];
  if (latestStoredIso != null) {
    const before = sorted.filter((row) => row.date < latestStoredIso);
    overlapFetched = before.slice(Math.max(0, before.length - overlapBars));
  }
  return { upserts, overlapFetched };
}

/**
 * 重叠区间前复权漂移校准：重叠日 close 比值（fetched/stored）的中位数即隐含复权因子比，
 * |factor-1|×100 超 tolerancePct 判定发生除权/口径漂移。
 * 注意 storedOverlap 入参约定为「写库前快照」（顺序由服务层保证：全窗口 upsert 会把旧口径行
 * 覆盖成新口径行，写后再读 DB 则 fetched/stored 恒 ≈1，除权告警被静默杀死）。
 * 重叠空/无有效配对 → { drifted:false, factor:null }（首抓无漂移概念）。
 * NaN/非正收盘脏值剔除；tolerance 边界：恰好等于不告警（严格大于才报）。
 */
export function computeAdjustDrift(
  storedOverlap: DriftRow[],
  fetchedOverlap: DriftRow[],
  tolerancePct: number
): { drifted: boolean; factor: number | null } {
  const fetchedByDate = new Map(fetchedOverlap.map((row) => [row.date, row.close]));
  const ratios: number[] = [];
  for (const stored of storedOverlap) {
    const fetchedClose = fetchedByDate.get(stored.date);
    if (fetchedClose == null || !Number.isFinite(stored.close) || !Number.isFinite(fetchedClose)) {
      continue;
    }
    if (stored.close <= 0 || fetchedClose <= 0) {
      continue;
    }
    ratios.push(fetchedClose / stored.close);
  }
  if (ratios.length === 0) {
    return { drifted: false, factor: null };
  }
  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // 偶数取中间两值均值：与奇数位中位数同为稳健统计量，除权段全量漂移时两者等价
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const drifted = Math.abs(median - 1) * 100 > tolerancePct;
  return { drifted, factor: median };
}

/**
 * K 线行 → 入库草稿；二次防线剔除非法行（呼应 parseEastmoneyKline 的剔除层）：
 * 日期不可归一 / 四价非正（≤0 或非有限数）→ null。
 * high<low 不在此层剔除（交给质量探针 high_low_inverted 标记，职责分离）。
 */
export function klineToRow(symbol: string, item: KlineItem): BarRowDraft | null {
  const tradeDate = toUtcMidnight(item.date);
  if (!tradeDate) {
    return null;
  }
  const open = Number(item.open);
  const high = Number(item.high);
  const low = Number(item.low);
  const close = Number(item.close);
  if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) {
    return null;
  }
  const volume = Number(item.volume);
  const amount = Number(item.amount);
  return {
    symbol,
    date: isoDay(tradeDate),
    tradeDate,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) && volume > 0 ? Math.round(volume) : 0,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0
  };
}
