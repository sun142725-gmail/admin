// 自选股 API 封装。
import http from './http';

export interface WatchlistItem {
  id: number;
  symbol: string;
  name: string;
  note?: string | null;
  group?: string;
  createdAt: string;
}

export const listWatchlist = () => http.get<never, WatchlistItem[]>('/stock/watchlist');

export const addToWatchlist = (payload: { symbol: string; name: string; note?: string; group?: string }) =>
  http.post<never, WatchlistItem>('/stock/watchlist', payload);

export const updateWatchlist = (symbol: string, payload: { note?: string; group?: string }) =>
  http.patch<never, WatchlistItem>(`/stock/watchlist/${symbol}`, payload);

export const removeFromWatchlist = (symbol: string) =>
  http.delete<never, { success: boolean }>(`/stock/watchlist/${symbol}`);
