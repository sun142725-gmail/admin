// 股票选股服务：按板块选池或手填代码，逐股拉 K 线并按 KDJ/MACD 金叉规则筛选。
// 复用 MarketDataService 的 K 线三级容灾与 TTL 缓存；单股失败跳过不中断整轮扫描。
// 交互扫描与每日定时扫描共用同一引擎：分批限流（每批 50 任务，批间歇 1 秒），
// 定时扫描任务上限放宽（无 HTTP 超时约束），并带运行/命中两张记录表的落库生命周期。
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
import { StockScreenerRun } from '../../common/entities/stock-screener-run.entity';
import { StockScreenerHit } from '../../common/entities/stock-screener-hit.entity';
import {
  EastmoneyBoard,
  EastmoneyClistResponse,
  StockListItem,
  buildEastmoneyAmountRankUrl,
  buildEastmoneyStockListUrl,
  EASTMONEY_BOARD_FS,
  parseEastmoneyStockList
} from './market/eastmoney.api';
import { fetchJson } from './market/http.util';
import { MarketDataService } from './market/market-data.service';
import { normalizeSymbol } from './market/tencent-quote.api';
import { ScreenerScanDto } from './dto/screener-scan.dto';

// 交互扫描任务（symbol×freq）上限：600 任务 ≈ 12 批，最坏 ~90 秒，在前端 150 秒超时内
const MAX_INTERACTIVE_TASKS = 600;
// 定时/触发扫描无 HTTP 超时约束，上限放宽（全市场 1500 只 × 1 周期绰绰有余）
const MAX_SCHEDULED_TASKS = 5000;
// 手填代码与板块候选池各自的容量上限
const MAX_MANUAL_SYMBOLS = 50;
const MAX_BOARD_SYMBOLS = 500;
// 成交额排行候选池上限（每日全市场扫描默认 1500）
const MAX_AMOUNT_SYMBOLS = 2000;
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

interface EngineOptions {
  indicators: ScreenerIndicator[];
  mode: ScreenerMode;
  status: ScreenerStatusFilter;
  withinBars: number;
}

/** 每日定时扫描配置（环境变量可覆盖，见 ScreenerScheduleService）。 */
export interface ScheduledScanConfig {
  dto: ScreenerScanDto;
  poolType: string;
  poolDesc: string;
}

@Injectable()
export class ScreenerService {
  private readonly logger = new Logger(ScreenerService.name);
  // 板块股票列表缓存：列表变化慢，10 分钟内重复扫描不重复拉列表
  private readonly boardListCache = new Map<EastmoneyBoard, { at: number; items: StockListItem[] }>();
  private static readonly BOARD_LIST_TTL_MS = 10 * 60 * 1000;
  // 成交额排行缓存：10 分钟内重复扫描/触发不重复拉 15 页列表
  private amountRankCache: { at: number; items: StockListItem[] } | null = null;
  private static readonly AMOUNT_RANK_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly market: MarketDataService,
    @InjectRepository(StockWatchlist)
    private readonly watchRepo: Repository<StockWatchlist>,
    @InjectRepository(StockRoundtable)
    private readonly roundtableRepo: Repository<StockRoundtable>,
    @InjectRepository(StockScreenerRun)
    private readonly runRepo: Repository<StockScreenerRun>,
    @InjectRepository(StockScreenerHit)
    private readonly hitRepo: Repository<StockScreenerHit>
  ) {}

  /** 交互扫描（HTTP 请求内完成，任务上限收紧）。 */
  async scan(dto: ScreenerScanDto, userId?: number): Promise<ScreenerScanResult> {
    const pool = await this.resolvePool(dto, userId);
    const options = this.resolveOptions(dto);
    const { matches, scanned, failed } = await this.runEngine(
      pool.symbols,
      this.resolveFreqs(dto.freqs),
      options,
      pool.nameBySymbol,
      MAX_INTERACTIVE_TASKS
    );
    return {
      universe: pool.desc,
      poolSize: pool.symbols.length,
      scanned,
      failed,
      matches: this.sortMatches(matches)
    };
  }

  // ==================== 运行记录生命周期（定时扫描 / 手动触发共用） ====================

  /** 是否有未完成的扫描运行（防止定时与触发重叠执行）。 */
  async hasRunningRun(): Promise<boolean> {
    const count = await this.runRepo.count({ where: { status: 'running' } });
    return count > 0;
  }

  /** 扫描运行历史（分页，新的在前）。 */
  async listRuns(page = 1, pageSize = 20) {
    const [items, total] = await this.runRepo.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items, total, page, pageSize };
  }

  /** 运行详情：运行记录 + 命中清单（金叉在前，按涨跌幅排序）。 */
  async getRun(id: number) {
    const run = await this.runRepo.findOne({ where: { id } });
    if (!run) {
      return null;
    }
    const hits = await this.hitRepo.find({ where: { runId: id } });
    hits.sort((a, b) => {
      const typeRank = (t: string) => (t === 'golden' ? 0 : 1);
      if (typeRank(a.signalType) !== typeRank(b.signalType)) {
        return typeRank(a.signalType) - typeRank(b.signalType);
      }
      const srcRank = (s: string) => (s === 'both' ? 0 : 1);
      if (srcRank(a.signalSource) !== srcRank(b.signalSource)) {
        return srcRank(a.signalSource) - srcRank(b.signalSource);
      }
      return (b.pct1d ?? -999) - (a.pct1d ?? -999);
    });
    return { run, hits };
  }

  /**
   * 创建一条 running 扫描记录并返回 runId（不执行扫描）。
   * 执行由调用方决定：定时任务同步 await executeRunRecord；手动触发后台 void 执行。
   * 若已有未完成运行则抛错（防重叠）。
   */
  async startRun(dto: ScreenerScanDto, userId?: number, poolType = 'manual', poolDesc = '手填代码'): Promise<number> {
    if (await this.hasRunningRun()) {
      throw new Error('已有扫描任务在运行中，请等待完成后再触发');
    }
    const run = await this.runRepo.save(
      this.runRepo.create({
        runDate: new Date().toISOString().slice(0, 10),
        poolType,
        poolDesc,
        config: JSON.stringify(this.configSnapshot(dto)),
        status: 'running'
      })
    );
    return run.id;
  }

  /** 执行一次已建档的扫描：引擎跑完把命中落库并回写运行记录。 */
  async executeRunRecord(runId: number, dto: ScreenerScanDto, userId?: number): Promise<void> {
    const startedAt = Date.now();
    try {
      const pool = await this.resolvePool(dto, userId);
      const options = this.resolveOptions(dto);
      const { matches, scanned, failed } = await this.runEngine(
        pool.symbols,
        this.resolveFreqs(dto.freqs),
        options,
        pool.nameBySymbol,
        MAX_SCHEDULED_TASKS
      );
      await this.persistHits(runId, matches);
      await this.runRepo.update(
        { id: runId },
        {
          poolSize: pool.symbols.length,
          scanned,
          failed,
          matched: matches.length,
          durationMs: Date.now() - startedAt,
          status: 'completed'
        }
      );
      this.logger.log(
        `扫描运行 ${runId} 完成：池 ${pool.symbols.length}，扫描 ${scanned}，命中 ${matches.length}，耗时 ${Date.now() - startedAt}ms`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.runRepo
        .update({ id: runId }, { status: 'failed', errorMessage: message.slice(0, 250), durationMs: Date.now() - startedAt })
        .catch(() => undefined);
      this.logger.error(`扫描运行 ${runId} 失败: ${message}`);
      throw error;
    }
  }

  /** 覆盖式写入命中记录：重跑同一条运行不留旧数据。 */
  private async persistHits(runId: number, matches: ScreenerMatch[]): Promise<void> {
    await this.hitRepo.delete({ runId });
    if (!matches.length) {
      return;
    }
    const rows = matches.map((match) => {
      const { signalType, signalSource, barsAgo } = summarizeSignals(match.signals);
      return this.hitRepo.create({
        runId,
        symbol: match.symbol,
        name: match.name,
        freq: match.freq,
        lastClose: match.lastClose,
        pct1d: match.pct1d,
        signalType,
        signalSource,
        barsAgo,
        signalsJson: JSON.stringify(match.signals)
      });
    });
    await this.hitRepo.save(rows);
  }

  /** 配置快照：写入运行记录供回溯（剔除空字段）。 */
  private configSnapshot(dto: ScreenerScanDto): Record<string, unknown> {
    return {
      ...(dto.boards?.length ? { boards: dto.boards, limit: dto.limit } : {}),
      ...(dto.pool ? { pool: dto.pool } : {}),
      ...(dto.symbols?.length ? { symbols: dto.symbols } : {}),
      freqs: this.resolveFreqs(dto.freqs),
      indicators: dto.indicators?.length ? dto.indicators : ['kdj', 'macd'],
      mode: dto.mode ?? 'any',
      status: dto.status ?? 'golden',
      withinBars: dto.withinBars ?? 3
    };
  }

  // ==================== 池解析 ====================

  private async resolvePool(
    dto: ScreenerScanDto,
    userId?: number
  ): Promise<{ symbols: string[]; nameBySymbol: Map<string, string>; desc: string }> {
    const nameBySymbol = new Map<string, string>();
    if (dto.boards?.length) {
      const boards = [...new Set(dto.boards)];
      const limit = Math.min(Math.max(dto.limit ?? 100, 1), MAX_BOARD_SYMBOLS);
      const list = await this.resolveBoardPool(boards, limit);
      list.forEach((item) => {
        if (item.name) {
          nameBySymbol.set(item.symbol, item.name);
        }
      });
      return {
        symbols: list.map((item) => item.symbol),
        nameBySymbol,
        desc: boards.map((board) => BOARD_LABEL[board]).join(' + ')
      };
    }
    if (dto.pool === 'amount') {
      const limit = Math.min(Math.max(dto.limit ?? 1500, 1), MAX_AMOUNT_SYMBOLS);
      const list = await this.amountRankList(limit);
      list.forEach((item) => {
        if (item.name) {
          nameBySymbol.set(item.symbol, item.name);
        }
      });
      return {
        symbols: list.map((item) => item.symbol),
        nameBySymbol,
        desc: `成交额 Top ${limit}`
      };
    }
    if (dto.pool === 'watchlist') {
      if (!userId) {
        throw new Error('自选股候选池需要登录用户');
      }
      const items = await this.watchRepo.find({ where: { userId }, order: { id: 'DESC' } });
      items.forEach((item) => {
        if (item.name && item.name !== item.symbol) {
          nameBySymbol.set(item.symbol, item.name);
        }
      });
      return { symbols: items.map((item) => item.symbol), nameBySymbol, desc: '我的自选股' };
    }
    if (dto.pool === 'roundtable') {
      if (!userId) {
        throw new Error('圆桌候选池需要登录用户');
      }
      // 圆桌分析过的个股：按用户全部历史去重（K 线源仅支持 sh/sz 个股，其他对象类型剔除）
      const rows = await this.roundtableRepo.find({
        where: { userId, subjectType: 'stock' },
        select: { subjectCode: true, subjectName: true }
      });
      const symbols = [
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
      return { symbols, nameBySymbol, desc: '圆桌分析过的股票' };
    }
    const symbols = [...new Set((dto.symbols ?? []).map((s) => this.normalizeInput(s)).filter(Boolean))].slice(
      0,
      MAX_MANUAL_SYMBOLS
    );
    return { symbols, nameBySymbol, desc: '手填代码' };
  }

  private resolveOptions(dto: ScreenerScanDto): EngineOptions {
    return {
      indicators: dto.indicators?.length ? dto.indicators : ['kdj', 'macd'],
      mode: dto.mode ?? 'any',
      status: dto.status ?? 'golden',
      withinBars: dto.withinBars ?? 3
    };
  }

  private resolveFreqs(freqs?: Array<'day' | 'week' | 'month' | 'any'>): KlineFreq[] {
    if (!freqs?.length || freqs.includes('any')) {
      return ['day', 'week', 'month'];
    }
    return [...new Set(freqs)] as KlineFreq[];
  }

  // ==================== 扫描引擎（分批限流） ====================

  private async runEngine(
    symbols: string[],
    freqs: KlineFreq[],
    options: EngineOptions,
    nameBySymbol: Map<string, string>,
    maxTasks: number
  ): Promise<{ matches: ScreenerMatch[]; scanned: number; failed: number }> {
    const tasks: Array<{ symbol: string; freq: KlineFreq }> = [];
    for (const symbol of symbols) {
      for (const freq of freqs) {
        if (tasks.length >= maxTasks) {
          break;
        }
        tasks.push({ symbol, freq });
      }
      if (tasks.length >= maxTasks) {
        break;
      }
    }

    const matches: ScreenerMatch[] = [];
    let failed = 0;
    let scanned = 0;
    let cursor = 0;

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
              const evaluation = evaluateScreener(items, options);
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
    return { matches, scanned, failed };
  }

  private sortMatches(matches: ScreenerMatch[]): ScreenerMatch[] {
    const statusRank = (s: 'golden' | 'upcoming' | null) => (s === 'golden' ? 0 : s === 'upcoming' ? 1 : 2);
    const freqRank: Record<KlineFreq, number> = { day: 0, week: 1, month: 2 };
    return [...matches].sort((a, b) => {
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
  }

  // ==================== 板块列表 ====================

  /**
   * 全市场成交额排行候选池：按当日成交额从大到小取前 limit 只。
   * 比市值排序更贴近实战——成交额反映当日活跃度与流动性，热门票自动入选，僵尸股天然排除。
   * 列表 10 分钟缓存；盘中值持续变化，收盘扫描取 15:30 时点快照。
   */
  private async amountRankList(limit: number): Promise<StockListItem[]> {
    const cached = this.amountRankCache;
    if (cached && Date.now() - cached.at < ScreenerService.AMOUNT_RANK_TTL_MS && cached.items.length >= limit) {
      return cached.items.slice(0, limit);
    }
    const items: StockListItem[] = [];
    const pageSize = 100;
    for (let page = 1; page <= Math.ceil(limit / pageSize) + 1; page += 1) {
      const payload = await fetchJson<EastmoneyClistResponse>(
        buildEastmoneyAmountRankUrl(page, pageSize)
      );
      const parsed = parseEastmoneyStockList(payload);
      items.push(...parsed.items);
      if (parsed.items.length < pageSize || items.length >= limit) {
        break;
      }
    }
    if (items.length) {
      this.amountRankCache = { at: Date.now(), items };
    }
    return items.slice(0, limit);
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
}

/** 双指标信号合并为一行命中的摘要：golden 优先，双同级命中记 both。 */
export function summarizeSignals(signals: ScreenerMatch['signals']): {
  signalType: 'golden' | 'upcoming';
  signalSource: 'kdj' | 'macd' | 'both';
  barsAgo: number | null;
} {
  const levels: Array<'kdj' | 'macd'> = ['kdj', 'macd'];
  for (const type of ['golden', 'upcoming'] as const) {
    const hit = levels.filter((k) => signals[k].status === type);
    if (hit.length) {
      const barsAgoList = hit
        .map((k) => signals[k].barsAgo)
        .filter((v): v is number => v != null);
      return {
        signalType: type,
        signalSource: hit.length === 2 ? 'both' : hit[0],
        barsAgo: barsAgoList.length ? Math.min(...barsAgoList) : null
      };
    }
  }
  // 引擎只推 matched 的结果，理论上不会走到这里；兜底记 upcoming
  return { signalType: 'upcoming', signalSource: 'kdj', barsAgo: null };
}
