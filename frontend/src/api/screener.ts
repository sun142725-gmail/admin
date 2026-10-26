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
  /** 个人候选池：watchlist=我的自选股；roundtable=圆桌分析过的个股。 */
  pool?: 'watchlist' | 'roundtable';
  /** 板块候选数量：按总市值从大到小取前 N。 */
  limit?: number;
  freqs?: Array<ScreenerFreq | 'any'>;
  indicators?: ScreenerIndicator[];
  mode?: ScreenerMode;
  status?: ScreenerStatus;
  withinBars?: number;
}

// 大池扫描可能跨多批，放宽到 150 秒（后端分批限流 + K 线缓存兜底）
export const scanScreener = (payload: ScreenerScanPayload) =>
  http.post<never, ScreenerScanResult>('/stock/screener/scan', payload, { timeout: 150000 });
