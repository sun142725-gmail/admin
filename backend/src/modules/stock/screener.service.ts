// 股票选股服务：按板块选池或手填代码，逐股拉 K 线并按 KDJ/MACD 金叉规则筛选。
// 复用 MarketDataService 的 K 线三级容灾与 TTL 缓存；单股失败跳过不中断整轮扫描。
// 大池扫描采用分批限流：每批 50 个任务，批间歇 1 秒，对上游公开接口保持克制。
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  KlineFreq,
  ScreenerIndicator,
  ScreenerMode,
  ScreenerStatusFilter,
  evaluateScreener
} from './indicators.util';
import { StockWatchlist } from '../../common/entities/stock-watchlist.entity';
import { StockRoundtable } from '../../common/entities/stock-roundtable.entity';
import {
  EastmoneyBoard,
  EastmoneyClistResponse,
  StockListItem,
  buildEastmoneyStockListUrl,
  EASTMONEY_BOARD_FS,
  parseEastmoneyStockList
} from './market/eastmoney.api';
import { fetchJson } from './market/http.util';
import { MarketDataService } from './market/market-data.service';
import { normalizeSymbol } from './market/tencent-quote.api';
import { ScreenerScanDto } from './dto/screener-scan.dto';

// 单轮扫描任务（symbol×freq）上限：600 任务 ≈ 12 批，最坏 ~90 秒，在前端 120 秒超时内
const MAX_SCAN_TASKS = 600;
// 手填代码与板块候选池各自的容量上限
const MAX_MANUAL_SYMBOLS = 50;
const MAX_BOARD_SYMBOLS = 500;
// 分批限流：每批任务数与批间歇
const BATCH_SIZE = 50;
const BATCH_PAUSE_MS = 1000;
// K 线请求并发上限
const SCAN_CONCURRENCY = 6;
// 各周期所需 K 线根数：MACD(12,26,9) 至少 35 根成型，多取保证 EMA 收敛
const FREQ_KLINE_LIMIT: Record<KlineFreq, number> = {
  day: 120,
  week: 120,
  month: 60
};

export const BOARD_LABEL: Record<EastmoneyBoard, string> = {
  main: '沪深主板',
  chinext: '创业板',
  star: '科创板'
};

export interface ScreenerMatch {
  symbol: string;
  name: string;
  freq: KlineFreq;
  lastClose: number;
  pct1d: number | null;
  signals: {
    kdj: { status: 'golden' | 'upcoming' | null; barsAgo?: number; gap?: number; fast?: number | null; slow?: number | null };
    macd: { status: 'golden' | 'upcoming' | null; barsAgo?: number; gap?: number; fast?: number | null; slow?: number | null };
  };
}

export interface ScreenerScanResult {
  /** 候选池来源描述（板块名或"手填代码"）。 */
  universe: string;
  /** 候选池股票数（板块模式为按市值截取后的数量）。 */
  poolSize: number;
  scanned: number;
  failed: number;
  matches: ScreenerMatch[];
}

@Injectable()
export class ScreenerService {
  private readonly logger = new Logger(ScreenerService.name);
  // 板块股票列表缓存：列表变化慢，10 分钟内重复扫描不重复拉列表
  private readonly boardListCache = new Map<EastmoneyBoard, { at: number; items: StockListItem[] }>();
  private static readonly BOARD_LIST_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly market: MarketDataService,
    @InjectRepository(StockWatchlist)
    private readonly watchRepo: Repository<StockWatchlist>,
    @InjectRepository(StockRoundtable)
    private readonly roundtableRepo: Repository<StockRoundtable>
  ) {}

  async scan(dto: ScreenerScanDto, userId?: number): Promise<ScreenerScanResult> {
    const freqs = this.resolveFreqs(dto.freqs);
    const indicators: ScreenerIndicator[] = dto.indicators?.length ? dto.indicators : ['kdj', 'macd'];
    const mode: ScreenerMode = dto.mode ?? 'any';
    const status: ScreenerStatusFilter = dto.status ?? 'golden';
    const withinBars = dto.withinBars ?? 3;

    // 候选池优先级：板块 > 个人池（自选/圆桌） > 手填代码
    let symbols: string[];
    let universe: string;
    let poolSize: number;
    // 个人池已知名称（K 线个别源不返回名称时兜底展示）
    const nameBySymbol = new Map<string, string>();
    if (dto.boards?.length) {
      const boards = [...new Set(dto.boards)];
      const limit = Math.min(Math.max(dto.limit ?? 100, 1), MAX_BOARD_SYMBOLS);
      const list = await this.resolveBoardPool(boards, limit);
      symbols = list.map((item) => item.symbol);
      list.forEach((item) => {
        if (item.name) {
          nameBySymbol.set(item.symbol, item.name);
        }
      });
      universe = boards.map((board) => BOARD_LABEL[board]).join(' + ');
      poolSize = list.length;
    } else if (dto.pool === 'watchlist') {
      if (!userId) {
        throw new Error('自选股候选池需要登录用户');
      }
      const items = await this.watchRepo.find({ where: { userId }, order: { id: 'DESC' } });
      symbols = items.map((item) => item.symbol);
      items.forEach((item) => {
        if (item.name && item.name !== item.symbol) {
          nameBySymbol.set(item.symbol, item.name);
        }
      });
      universe = '我的自选股';
      poolSize = symbols.length;
    } else if (dto.pool === 'roundtable') {
      if (!userId) {
        throw new Error('圆桌候选池需要登录用户');
      }
      // 圆桌分析过的个股：按用户全部历史去重（K 线源仅支持 sh/sz 个股，其他对象类型剔除）
      const rows = await this.roundtableRepo.find({
        where: { userId, subjectType: 'stock' },
        select: { subjectCode: true, subjectName: true }
      });
      symbols = [
        ...new Set(
          rows.map((row) => (row.subjectCode ?? '').toLowerCase()).filter((code) => /^(sh|sz)\d{6}$/.test(code))
        )
      ];
      rows.forEach((row) => {
        const code = (row.subjectCode ?? '').toLowerCase();
        if (/^(sh|sz)\d{6}$/.test(code) && row.subjectName) {
          nameBySymbol.set(code, row.subjectName);
        }
      });
      universe = '圆桌分析过的股票';
      poolSize = symbols.length;
    } else {
      symbols = [...new Set((dto.symbols ?? []).map((s) => this.normalizeInput(s)).filter(Boolean))].slice(
        0,
        MAX_MANUAL_SYMBOLS
      );
      universe = '手填代码';
      poolSize = symbols.length;
    }
    if (!symbols.length) {
      return { universe, poolSize: 0, scanned: 0, failed: 0, matches: [] };
    }

    const tasks: Array<{ symbol: string; freq: KlineFreq }> = [];
    for (const symbol of symbols) {
      for (const freq of freqs) {
        if (tasks.length >= MAX_SCAN_TASKS) {
          break;
        }
        tasks.push({ symbol, freq });
      }
      if (tasks.length >= MAX_SCAN_TASKS) {
        break;
      }
    }

    const matches: ScreenerMatch[] = [];
    let failed = 0;
    let scanned = 0;
    let cursor = 0;

    // 分批限流：每批 BATCH_SIZE 个任务并发消费，批间歇 BATCH_PAUSE_MS
    for (let batchStart = 0; batchStart < tasks.length; batchStart += BATCH_SIZE) {
      const batch = tasks.slice(batchStart, batchStart + BATCH_SIZE);
      cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(SCAN_CONCURRENCY, batch.length) }, async () => {
          for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= batch.length) {
              return;
            }
            const { symbol, freq } = batch[index];
            try {
              const { name, items } = await this.market.kline(symbol, FREQ_KLINE_LIMIT[freq], freq);
              scanned += 1;
              const evaluation = evaluateScreener(items, { indicators, mode, status, withinBars });
              if (!evaluation?.matched) {
                continue;
              }
              const last = items[items.length - 1];
              const prev = items.length > 1 ? items[items.length - 2] : null;
              matches.push({
                symbol,
                name: name || nameBySymbol.get(symbol) || '',
                freq,
                lastClose: last.close,
                pct1d:
                  prev && prev.close > 0
                    ? Math.round(((last.close - prev.close) / prev.close) * 10000) / 100
                    : null,
                signals: { kdj: evaluation.kdj, macd: evaluation.macd }
              });
            } catch (error) {
              failed += 1;
              this.logger.warn(
                `选股扫描跳过 ${symbol}@${freq}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        })
      );
      if (batchStart + BATCH_SIZE < tasks.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
      }
    }

    // 结果排序：金叉优先于即将金叉，金叉按时间新→旧，再按周期
    const statusRank = (s: 'golden' | 'upcoming' | null) => (s === 'golden' ? 0 : s === 'upcoming' ? 1 : 2);
    const freqRank: Record<KlineFreq, number> = { day: 0, week: 1, month: 2 };
    matches.sort((a, b) => {
      const bestA = Math.min(...['kdj', 'macd'].map((k) => statusRank(a.signals[k as ScreenerIndicator].status)));
      const bestB = Math.min(...['kdj', 'macd'].map((k) => statusRank(b.signals[k as ScreenerIndicator].status)));
      if (bestA !== bestB) {
        return bestA - bestB;
      }
      const barsA = Math.min(
        ...['kdj', 'macd'].filter((k) => a.signals[k as ScreenerIndicator].barsAgo != null).map((k) => a.signals[k as ScreenerIndicator].barsAgo as number),
        99
      );
      const barsB = Math.min(
        ...['kdj', 'macd'].filter((k) => b.signals[k as ScreenerIndicator].barsAgo != null).map((k) => b.signals[k as ScreenerIndicator].barsAgo as number),
        99
      );
      if (barsA !== barsB) {
        return barsA - barsB;
      }
      return freqRank[a.freq] - freqRank[b.freq];
    });

    return { universe, poolSize, scanned, failed, matches };
  }

  /**
   * 板块候选池：按总市值从大到小取前 limit 只（大盘股 K 线数据质量与流动性更好，
   * 也天然避开仙股/退市股）。列表带 10 分钟缓存。
   */
  private async resolveBoardPool(boards: EastmoneyBoard[], limit: number): Promise<StockListItem[]> {
    const merged = new Map<string, StockListItem>();
    for (const board of boards) {
      const list = await this.boardList(board, limit);
      for (const item of list) {
        if (!merged.has(item.symbol)) {
          merged.set(item.symbol, item);
        }
      }
    }
    return [...merged.values()]
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, limit);
  }

  private async boardList(board: EastmoneyBoard, limit: number): Promise<StockListItem[]> {
    const cached = this.boardListCache.get(board);
    if (cached && Date.now() - cached.at < ScreenerService.BOARD_LIST_TTL_MS && cached.items.length >= limit) {
      return cached.items.slice(0, limit);
    }
    const items: StockListItem[] = [];
    const pageSize = 100;
    for (let page = 1; page <= Math.ceil(limit / pageSize) + 1; page += 1) {
      const payload = await fetchJson<EastmoneyClistResponse>(
        buildEastmoneyStockListUrl(EASTMONEY_BOARD_FS[board], page, pageSize)
      );
      const parsed = parseEastmoneyStockList(payload);
      items.push(...parsed.items);
      if (parsed.items.length < pageSize || items.length >= limit) {
        break;
      }
    }
    if (items.length) {
      this.boardListCache.set(board, { at: Date.now(), items });
    }
    return items.slice(0, limit);
  }

  /** 归一化用户输入：600519.SH → sh600519；裸 6 位按交易所推断。 */
  private normalizeInput(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
      return '';
    }
    const suffixed = /^(\d{6})\.(sh|sz|bj)$/i.exec(trimmed);
    if (suffixed) {
      return normalizeSymbol(`${suffixed[2]}${suffixed[1]}`);
    }
    return normalizeSymbol(trimmed);
  }

  /** freqs 归一化：any/缺省 → 三周期全扫。 */
  private resolveFreqs(freqs?: Array<'day' | 'week' | 'month' | 'any'>): KlineFreq[] {
    if (!freqs?.length || freqs.includes('any')) {
      return ['day', 'week', 'month'];
    }
    return [...new Set(freqs)] as KlineFreq[];
  }
}
