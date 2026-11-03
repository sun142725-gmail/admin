// 日线行情库质量探针纯函数（无 I/O，不依赖 Nest 容器，单测 test/daily-bars-quality.util.spec.ts）：
// 工作日缺口 / 单根异常码 / 除权跳变 / 单标的聚合 / 缺口锚点。
// 口径显式声明：无交易日历，「周一~五日历日缺失」推断缺口——法定长假（春节/国庆等）会误报，
// 报表 UI 固定文案标注「按周一~五推断，法定节假日会误报」；MIN_GAP_DAYS=3 已过滤单日/双日短假。
import { isoDay } from './daily-bars-calib.util';

/** 缺口判定共享默认阈值：相邻两根间跳过的周一~五日历日 ≥3 才算缺口（单日/双日假不报，长假报）。 */
export const MIN_GAP_DAYS = 3;

/** 除权跳变默认阈值（%）：相邻收盘 |涨跌幅| 超过即标记（除权 seam 或脏数据）。 */
export const JUMP_THRESHOLD_PCT = 20;

/** 质量探针输入行（服务层由 DB 实体行归一而来；date 为 UTC 'YYYY-MM-DD'）。 */
export interface QualityBarRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WeekdayGap {
  /** 缺口前一根（最后落库的交易日）。 */
  from: string;
  /** 缺口后第一根（恢复交易的交易日）。 */
  to: string;
  skippedWeekdays: number;
  /** true=缺口起点早于 today−autoWindowDays 日历天，自动补抓窗口够不着（需手动 full 重抓）。 */
  outsideAutoWindow: boolean;
}

export type BarAnomalyCode = 'zero_volume' | 'non_positive_price' | 'high_low_inverted' | 'oc_out_of_range';

export interface BarAnomaly {
  tradeDate: string;
  codes: BarAnomalyCode[];
}

export interface SuspiciousJump {
  tradeDate: string;
  /** 相邻收盘涨跌幅 %（保留 2 位小数）。 */
  pct: number;
}

export interface SymbolQualitySummary {
  symbol: string;
  barCount: number;
  firstDate: string | null;
  lastDate: string | null;
  weekdayGaps: WeekdayGap[];
  anomalies: BarAnomaly[];
  suspiciousJumps: SuspiciousJump[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日期升序排序（乱序输入防御，全函数族共用）。 */
function sortByDate<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 两根之间跳过的周一~五日历日数（开区间：不含 from 日与 to 日本身）。 */
function skippedWeekdaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return 0;
  }
  let count = 0;
  for (let t = from + DAY_MS; t < to; t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      count += 1;
    }
  }
  return count;
}

/**
 * 工作日缺口：相邻两根间跳过的周一~五日历日 ≥ minGapDays（默认 MIN_GAP_DAYS=3）才算缺口。
 * 单日/双日假（默认阈值）不报，跨 7 天长假报；周末不报；单根/空数组无缺口；乱序输入先排序。
 */
export function detectWeekdayGaps(rows: QualityBarRow[], minGapDays: number = MIN_GAP_DAYS): WeekdayGap[] {
  const sorted = sortByDate(rows);
  const gaps: WeekdayGap[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const skipped = skippedWeekdaysBetween(sorted[i - 1].date, sorted[i].date);
    if (skipped >= minGapDays) {
      // outsideAutoWindow 在 summarizeSymbolQuality 统一判定（本函数无窗口语义）
      gaps.push({ from: sorted[i - 1].date, to: sorted[i].date, skippedWeekdays: skipped, outsideAutoWindow: false });
    }
  }
  return gaps;
}

/** 单根异常码（固定顺序）：停牌占位 / 非正价格 / 高低点倒挂 / 开收越出高低区间。 */
export function detectBarAnomalies(row: QualityBarRow): BarAnomalyCode[] {
  const codes: BarAnomalyCode[] = [];
  if (row.volume === 0) {
    codes.push('zero_volume');
  }
  const prices = [row.open, row.high, row.low, row.close];
  if (prices.some((v) => !Number.isFinite(v) || v <= 0)) {
    codes.push('non_positive_price');
  }
  if (Number.isFinite(row.high) && Number.isFinite(row.low) && row.high < row.low) {
    codes.push('high_low_inverted');
  }
  const ocOutOfRange =
    (Number.isFinite(row.open) && Number.isFinite(row.high) && row.open > row.high) ||
    (Number.isFinite(row.open) && Number.isFinite(row.low) && row.open < row.low) ||
    (Number.isFinite(row.close) && Number.isFinite(row.high) && row.close > row.high) ||
    (Number.isFinite(row.close) && Number.isFinite(row.low) && row.close < row.low);
  if (ocOutOfRange) {
    codes.push('oc_out_of_range');
  }
  return codes;
}

/**
 * 相邻收盘 |涨跌幅| > thresholdPct（默认 20%）→ 除权 seam 或脏数据标记。
 * 首根无前值不报；前值非正（停牌 0 收盘）不报（比值无意义，异常已由 non_positive_price 标记）。
 */
export function detectSuspiciousJumps(rows: QualityBarRow[], thresholdPct: number = JUMP_THRESHOLD_PCT): SuspiciousJump[] {
  const sorted = sortByDate(rows);
  const jumps: SuspiciousJump[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].close;
    const cur = sorted[i].close;
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0 || cur <= 0) {
      continue;
    }
    const pct = Math.round((cur / prev - 1) * 10000) / 100;
    if (Math.abs(pct) > thresholdPct) {
      jumps.push({ tradeDate: sorted[i].date, pct });
    }
  }
  return jumps;
}

/**
 * 单标的聚合：barCount/first/last + 缺口（附 outsideAutoWindow 判定）+ 异常行 + 跳变。
 * outsideAutoWindow：缺口起点早于 today−autoWindowDays 日历天——缺口早于自动补抓窗口的
 * 「实际日历回看跨度」才够不着，需手动 full 重抓。autoWindowDays 必须传根数换算后的日历天
 * （barsToCalendarDays(initBars)，250 根 ≈350 日历天）；直接传根数会把 ~250-355 天带内
 * 本可自动回补的缺口误标窗口外（评审意见 3）。缺省 250 仅作无 opts 时的兜底。
 * 空标的零值：barCount 0 / first/last null / 三数组空。
 */
export function summarizeSymbolQuality(
  symbol: string,
  rows: QualityBarRow[],
  opts?: { today?: Date; autoWindowDays?: number }
): SymbolQualitySummary {
  const sorted = sortByDate(rows);
  const firstDate = sorted.length > 0 ? sorted[0].date : null;
  const lastDate = sorted.length > 0 ? sorted[sorted.length - 1].date : null;
  const gaps = detectWeekdayGaps(sorted);
  if (gaps.length > 0) {
    const today = opts?.today ?? new Date();
    const windowDays = opts?.autoWindowDays ?? 250;
    const today0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const cutoff = isoDay(new Date(today0.getTime() - windowDays * DAY_MS));
    for (const gap of gaps) {
      gap.outsideAutoWindow = gap.from < cutoff;
    }
  }
  const anomalies: BarAnomaly[] = [];
  for (const row of sorted) {
    const codes = detectBarAnomalies(row);
    if (codes.length > 0) {
      anomalies.push({ tradeDate: row.date, codes });
    }
  }
  return {
    symbol,
    barCount: sorted.length,
    firstDate,
    lastDate,
    weekdayGaps: gaps,
    anomalies,
    suspiciousJumps: detectSuspiciousJumps(sorted)
  };
}

/**
 * 存储日期序列中最早一处工作日缺口的「缺口前一根日」（作为拉取窗口扩锚）。
 * 无缺口/单根/空 → null；乱序输入先排序后计算。
 */
export function earliestGapAnchor(dates: string[], minGapDays: number = MIN_GAP_DAYS): string | null {
  if (dates.length < 2) {
    return null;
  }
  const sorted = [...dates].sort();
  for (let i = 1; i < sorted.length; i += 1) {
    if (skippedWeekdaysBetween(sorted[i - 1], sorted[i]) >= minGapDays) {
      return sorted[i - 1];
    }
  }
  return null;
}
