// 股票选股 API 封装。
import http from './http';

export type ScreenerFreq = 'day' | 'week' | 'month';
export type ScreenerIndicator = 'kdj' | 'macd';
export type ScreenerMode = 'any' | 'all';
export type ScreenerStatus = 'golden' | 'upcoming' | 'both';
export type ScreenerBoard = 'main' | 'chinext' | 'star';

export const BOARD_LABELS: Record<ScreenerBoard, string> = {
  main: '沪深主板',
  chinext: '创业板',
  star: '科创板'
};

export interface ScreenerSignal {
  status: 'golden' | 'upcoming' | null;
  barsAgo?: number;
  gap?: number;
  fast?: number | null;
  slow?: number | null;
}

export interface ScreenerMatch {
  symbol: string;
  name: string;
  freq: ScreenerFreq;
  lastClose: number;
  pct1d: number | null;
  signals: {
    kdj: ScreenerSignal;
    macd: ScreenerSignal;
  };
}

export interface ScreenerScanResult {
  /** 候选池来源描述（板块名组合或"手填代码"）。 */
  universe: string;
  poolSize: number;
  scanned: number;
  failed: number;
  matches: ScreenerMatch[];
}

export interface ScreenerScanPayload {
  symbols?: string[];
  boards?: ScreenerBoard[];
  /** 个人候选池：watchlist=我的自选股；roundtable=圆桌分析过的个股；amount=全市场成交额排行 Top limit。 */
  pool?: 'watchlist' | 'roundtable' | 'amount';
  /** 板块候选数量：按排序字段从大到小取前 N。 */
  limit?: number;
  /** 板块池排序：marketCap 市值 / amount 成交额 / volume 成交量 / random 随机。 */
  sortBy?: 'marketCap' | 'amount' | 'volume' | 'random';
  freqs?: Array<ScreenerFreq | 'any'>;
  indicators?: ScreenerIndicator[];
  mode?: ScreenerMode;
  status?: ScreenerStatus;
  withinBars?: number;
}

// 大池扫描可能跨多批，放宽到 150 秒（后端分批限流 + K 线缓存兜底）
export const scanScreener = (payload: ScreenerScanPayload) =>
  http.post<never, ScreenerScanResult>('/stock/screener/scan', payload, { timeout: 150000 });

// ==================== 每日扫描运行记录 ====================

export interface ScreenerRun {
  id: number;
  runDate: string;
  poolType: string;
  poolDesc: string;
  config: string;
  poolSize: number;
  scanned: number;
  failed: number;
  matched: number;
  durationMs: number;
  status: 'running' | 'completed' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
}

export interface ScreenerHit {
  id: number;
  runId: number;
  symbol: string;
  name: string;
  freq: ScreenerFreq;
  lastClose: number | null;
  pct1d: number | null;
  signalType: 'golden' | 'upcoming';
  signalSource: 'kdj' | 'macd' | 'both';
  barsAgo: number | null;
  signalsJson: string | null;
}

export const listScreenerRuns = (page = 1, pageSize = 20) =>
  http.get<never, { items: ScreenerRun[]; total: number; page: number; pageSize: number }>(
    '/stock/screener/runs',
    { params: { page, pageSize } }
  );

export const getScreenerRun = (id: number) =>
  http.get<never, { run: ScreenerRun; hits: ScreenerHit[] } | null>(`/stock/screener/runs/${id}`);

/** 手动触发一次带记录的扫描（后台执行），返回 runId。 */
export const triggerScreenerRun = (payload?: Partial<ScreenerScanPayload>) =>
  http.post<never, { runId: number }>('/stock/screener/runs/trigger', payload ?? {}, { timeout: 15000 });
