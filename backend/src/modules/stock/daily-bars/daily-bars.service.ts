// 日线行情库服务：增量断点续抓（多源容灾 + 限流）+ 全量重抓 + 质量探针报表数据源。
// 复权口径（与 stock-daily-bar.entity.ts 表注释一致）：OHLC 存前复权价，volume/amount 原始口径。
// 【源门禁】MarketDataService.kline() 三级容灾（东财→腾讯→新浪）中仅东财主源满足完整口径
// （东财 fqt=1 前复权且成交额真实；腾讯 qfqday 前复权但 amount 恒 0；新浪不复权且 amount 恒 0），
// 故 source!=='eastmoney' 时该标的本轮跳过不写任何行（计数 + Logger.warn，下轮自动重试）——
// 新浪不复权会以错误价覆盖前复权序列，双源 amount=0 会把真实成交额清零，
// 降级是暂态而错误口径写入是持久伤害，宁缺毋滥。
// 【写前快照顺序约束】backfillSymbol 内「快照重叠段存量行」必须先于「全窗口 upsert」执行：
// upsert 会把重叠段旧口径行覆盖成新口径行，若写后再读 DB，fetched/stored 恒 ≈1，
// 复权漂移告警被静默杀死（e2e 用例 7 为该顺序的回归防线）。
// 【缓存语义】kline 10 分钟 TTL 缓存 key=${symbol}:${limit}:${freq}——limit 随缺口天数变化则跨轮
// 换 key；缓存只是顺带减负不是限流手段，真正的限流是串行 + sleep + 单轮上限。
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { StockDailyBar } from '../../../common/entities/stock-daily-bar.entity';
import { StockScreenerHit } from '../../../common/entities/stock-screener-hit.entity';
import { StockScreenerRun } from '../../../common/entities/stock-screener-run.entity';
import { StockWatchlist } from '../../../common/entities/stock-watchlist.entity';
import { MarketDataService } from '../market/market-data.service';
import {
  BarRowDraft,
  barsToCalendarDays,
  computeAdjustDrift,
  computeFetchLimit,
  isoDay,
  klineToRow,
  splitBarsForUpsert,
  toUtcMidnight
} from './daily-bars-calib.util';
import {
  earliestGapAnchor,
  MIN_GAP_DAYS,
  QualityBarRow,
  summarizeSymbolQuality,
  SymbolQualitySummary
} from './daily-bars-quality.util';
import { QueryOverviewDto } from './dto/query-overview.dto';

// 代码常量（MVP 口径固定，变更需改代码评审，不进环境变量）
export const DAILY_BARS_BUFFER_DAYS = 5; // 拉取窗口向后兜底日历天
export const DAILY_BARS_OVERLAP_BARS = 30; // 漂移校准重叠根数（中位数稳健性下限）
export const DAILY_BARS_DRIFT_TOLERANCE_PCT = 1; // 前复权漂移告警阈值（%），正常重抓应恒等
export const DAILY_BARS_FULL_MAX_BARS = 1000; // 全量重抓硬顶（超老标的 full 后截短，MVP 显式取舍）

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackfillSymbolSummary {
  symbol: string;
  /** 上游拉取窗口合法行数。 */
  fetched: number;
  /** 实际 upsert 行数（含覆盖更新）。 */
  written: number;
  /** true=源门禁跳过（非东财），本轮未写任何行。 */
  skipped: boolean;
  /** true=上游三源全挂，本轮未写任何行。 */
  failed: boolean;
  source?: string;
  /** 复权漂移告警（增量路径才有意义；全量重抓不判漂移）。 */
  drifted: boolean;
  factor: number | null;
  /** 质量探针异常行数（收尾告警日志用）。 */
  anomalyRows: number;
}

export interface BackfillRunSummary {
  total: number;
  written: number;
  skippedBySource: number;
  failed: number;
  drifted: number;
  symbols: BackfillSymbolSummary[];
}

export interface QualityOverviewItem {
  symbol: string;
  name: string;
  barCount: number;
  firstDate: string | null;
  lastDate: string | null;
  staleDays: number;
}

export interface QualityOverview {
  universe: { watchlistSymbols: number; screenerSymbols: number; barsTotal: number };
  total: number;
  items: QualityOverviewItem[];
}

export interface QualityDetailItem extends SymbolQualitySummary {
  barCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

@Injectable()
export class DailyBarsService {
  private readonly logger = new Logger(DailyBarsService.name);
  // 进程内运行锁（单实例 MVP）：防定时轮与手动 trigger 重入；重启重入无害（全流程幂等）
  private running = false;

  constructor(
    @InjectRepository(StockDailyBar)
    private readonly barRepo: Repository<StockDailyBar>,
    @InjectRepository(StockWatchlist)
    private readonly watchRepo: Repository<StockWatchlist>,
    @InjectRepository(StockScreenerHit)
    private readonly hitRepo: Repository<StockScreenerHit>,
    @InjectRepository(StockScreenerRun)
    private readonly runRepo: Repository<StockScreenerRun>,
    private readonly marketData: MarketDataService
  ) {}

  // ==================== 宇宙解析 ====================

  /**
   * 抓取宇宙：自选 DISTINCT(stock_watchlist) ∪ 近 poolDays 天扫描命中
   * DISTINCT(stock_screener_hits JOIN stock_screener_runs, run.status='completed')。
   * QueryBuilder 一律用实体属性名（w.symbol / hit.symbol / run.runDate），写 DB 列名在 sqlite 下直接报错。
   */
  async resolveUniverse(poolDays: number): Promise<{
    watchlistSymbols: string[];
    screenerSymbols: string[];
    names: Map<string, string>;
  }> {
    const [watchRows, hitRows] = await Promise.all([
      this.watchRepo.createQueryBuilder('w').select(['w.symbol', 'w.name']).getMany(),
      this.hitRepo
        .createQueryBuilder('hit')
        .select(['hit.symbol', 'hit.name'])
        .innerJoin(StockScreenerRun, 'run', 'run.id = hit.runId')
        .where('run.status = :status', { status: 'completed' })
        .andWhere('run.runDate >= :cutoff', { cutoff: isoDay(new Date(Date.now() - poolDays * DAY_MS)) })
        .getMany()
    ]);
    const watchlistSymbols = [...new Set(watchRows.map((row) => row.symbol))];
    const screenerSymbols = [...new Set(hitRows.map((row) => row.symbol))];
    // 名称冗余列：自选名优先，候选池命中名兜底，都无则空串
    const names = new Map<string, string>();
    for (const row of hitRows) {
      if (row.name) {
        names.set(row.symbol, row.name);
      }
    }
    for (const row of watchRows) {
      if (row.name) {
        names.set(row.symbol, row.name);
      }
    }
    return { watchlistSymbols, screenerSymbols, names };
  }

  // ==================== 增量续抓 ====================

  /**
   * 单标的增量续抓（断点续抓 + 源门禁 + 漂移校准）。流程序号即实现顺序——
   * ⑥ 写前快照必须先于 ⑦ 全窗口 upsert（硬性顺序约束，见文件头注释）。
   */
  async backfillSymbol(symbol: string): Promise<BackfillSymbolSummary> {
    const summary: BackfillSymbolSummary = {
      symbol,
      fetched: 0,
      written: 0,
      skipped: false,
      failed: false,
      drifted: false,
      factor: null,
      anomalyRows: 0
    };
    // ① 查该标的全部 tradeDate 单列（一次轻查询，≤几百行）
    const storedRows = await this.barRepo.find({
      select: ['tradeDate'],
      where: { symbol },
      order: { tradeDate: 'ASC' }
    });
    const dates = storedRows.map((row) => isoDay(row.tradeDate));
    const latestIso = dates.length > 0 ? dates[dates.length - 1] : null;
    // ② 最早中段缺口锚点（纯函数；节假日会成锚 → 窗口扩到长假前，多拉幂等重复行无害）
    const gapAnchorIso = earliestGapAnchor(dates, MIN_GAP_DAYS);
    // ③ 按更早者扩窗的拉取根数
    const initBars = this.initBars();
    const limit = computeFetchLimit(latestIso, gapAnchorIso, new Date(), initBars, initBars, DAILY_BARS_BUFFER_DAYS);
    // ④ 复用现成三级容灾（东财→腾讯→新浪）；三源全挂 ServiceUnavailableException → 计失败继续
    let kline: Awaited<ReturnType<MarketDataService['kline']>>;
    try {
      kline = await this.marketData.kline(symbol, limit, 'day');
    } catch (error) {
      summary.failed = true;
      this.logger.warn(
        `[日线补抓] ${symbol} 上游 K 线全源失败（limit=${limit}）: ${error instanceof Error ? error.message : String(error)}`
      );
      return summary;
    }
    // ⑤ 源门禁：非东财（含无 source 的旧消费方路径/腾讯/新浪降级）整标的跳过，不写任何行
    if (kline.source !== 'eastmoney') {
      summary.skipped = true;
      summary.source = kline.source ?? 'unknown';
      this.logger.warn(
        `[日线补抓] ${symbol} K 线来自降级源 ${summary.source}（口径不满足前复权+真实成交额），本轮跳过写入，下轮自动重试`
      );
      return summary;
    }
    summary.source = 'eastmoney';
    // ⑥ 写库前快照重叠段存量行（DB 侧最近 OVERLAP_BARS 根）——必须在 ⑦ 之前
    const storedOverlap: { date: string; close: number }[] = [];
    if (latestIso != null) {
      const latestStored = toUtcMidnight(latestIso);
      if (latestStored) {
        const rows = await this.barRepo
          .createQueryBuilder('bar')
          .select(['bar.tradeDate', 'bar.close'])
          .where('bar.symbol = :symbol', { symbol })
          .andWhere('bar.tradeDate < :latest', { latest: latestStored })
          .orderBy('bar.tradeDate', 'DESC')
          .take(DAILY_BARS_OVERLAP_BARS)
          .getMany();
        storedOverlap.push(
          ...rows
            .map((row) => ({ date: isoDay(row.tradeDate), close: Number(row.close) }))
            .reverse()
        );
      }
    }
    // ⑦ 全窗口逐行幂等 upsert（中段历史缺口随窗口重拉自动回填，最新一根重写修正收盘结算）
    const drafts = (kline.items ?? [])
      .map((item) => klineToRow(symbol, item))
      .filter((row): row is BarRowDraft => row !== null);
    summary.fetched = drafts.length;
    const { upserts, overlapFetched } = splitBarsForUpsert(drafts, latestIso, DAILY_BARS_OVERLAP_BARS);
    for (const row of upserts) {
      await this.upsertBarRow(row);
      summary.written += 1;
    }
    // ⑧ 复权漂移检测（输入是 ⑥ 的写前快照，非实时 DB 读；仅告警不删行）
    const drift = computeAdjustDrift(storedOverlap, overlapFetched, DAILY_BARS_DRIFT_TOLERANCE_PCT);
    summary.drifted = drift.drifted;
    summary.factor = drift.factor;
    if (drift.drifted) {
      this.logger.warn(
        `[日线补抓] ${symbol} 疑似除权/口径漂移：重叠段前复权收盘比值中位数=${drift.factor?.toFixed(4)}（阈值 ±${DAILY_BARS_DRIFT_TOLERANCE_PCT}%），建议手动 full 重抓修复`
      );
    }
    // ⑨ upsert 完成后重跑该标的质量探针（告警进日志；报表另有按需探针）
    summary.anomalyRows = await this.warnQuality(symbol);
    return summary;
  }

  /** 串行补抓：逐标的间 sleep 限流；失败/降级跳过计数继续。
   *  单轮上限只约束宇宙路径（定时/全宇宙触发，余量下轮续跑）；显式 symbols 清单不截断——
   *  运维/用户点名要补的清单静默少抓是正确性意外，且手动路径体量本就由 DTO 上限 50 兜底
   *  （评审意见 2：STOCK_BARS_MAX_PER_RUN 配成 <50 时显式清单会被静默截断）。 */
  async backfillUniverse(symbols?: string[], opts?: { full?: boolean }): Promise<BackfillRunSummary> {
    if (this.running) {
      throw new Error('已有补抓任务在运行中');
    }
    this.running = true;
    try {
      const intervalMs = this.intervalMs();
      const maxPerRun = this.maxPerRun();
      const explicit = symbols != null && symbols.length > 0;
      const target = explicit ? [...new Set(symbols)] : await this.universeSymbols();
      const batch = explicit ? target : target.slice(0, maxPerRun);
      if (explicit && target.length > maxPerRun) {
        this.logger.warn(
          `[日线补抓] 显式清单 ${target.length} 个标的超单轮上限 ${maxPerRun}，按清单全量执行（手动路径由 DTO ≤50 兜底上游压力）`
        );
      } else if (!explicit && target.length > batch.length) {
        this.logger.warn(`[日线补抓] 宇宙 ${target.length} 个标的超单轮上限 ${maxPerRun}，余量下轮续跑`);
      }
      const runSummary: BackfillRunSummary = {
        total: batch.length,
        written: 0,
        skippedBySource: 0,
        failed: 0,
        drifted: 0,
        symbols: []
      };
      for (let i = 0; i < batch.length; i += 1) {
        if (i > 0 && intervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs)); // 上游限流：串行 + sleep
        }
        const symbol = batch[i];
        try {
          const one = opts?.full ? await this.fullRefetch(symbol) : await this.backfillSymbol(symbol);
          runSummary.symbols.push(one);
          runSummary.written += one.written;
          if (one.skipped) {
            runSummary.skippedBySource += 1;
          }
          if (one.failed) {
            runSummary.failed += 1;
          }
          if (one.drifted) {
            runSummary.drifted += 1;
          }
        } catch (error) {
          runSummary.failed += 1;
          // 单标的失败不致命（AGENTS 条款）：计数继续，下轮自动重试
          this.logger.warn(`[日线补抓] ${symbol} 补抓异常: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.logger.log(
        `[日线补抓] 本轮完成：标的 ${runSummary.total}，写入 ${runSummary.written} 行，降级跳过 ${runSummary.skippedBySource}，失败 ${runSummary.failed}，漂移告警 ${runSummary.drifted}`
      );
      return runSummary;
    } finally {
      this.running = false;
    }
  }

  // ==================== 全量重抓（手动 full 专用；定时增量绝不删行） ====================

  /**
   * 全量重抓：先抓成功后删 + 同一事务内批量 INSERT（不存在「已删未抓」空窗）。
   * 根数 = clamp(max(initBars, 现存 barCount), FULL_MAX_BARS=1000)——否则存量因中段补缺超过
   * initBars 根时 full 会「删全部、只回最近 initBars 根」历史不增反减；
   * 硬顶 1000：极老标的（存量 >1000）full 后历史截短到 1000 根，由报表缺口/跳变可见（MVP 显式取舍）。
   * 要求 source==='eastmoney' 且合法行数>0，任一不满足整体放弃、存量分毫不动并返回失败。
   */
  async fullRefetch(symbol: string): Promise<BackfillSymbolSummary> {
    const summary: BackfillSymbolSummary = {
      symbol,
      fetched: 0,
      written: 0,
      skipped: false,
      failed: false,
      drifted: false,
      factor: null,
      anomalyRows: 0
    };
    const barCount = await this.barRepo.count({ where: { symbol } });
    const fetchCount = Math.min(Math.max(this.initBars(), barCount), DAILY_BARS_FULL_MAX_BARS);
    let kline: Awaited<ReturnType<MarketDataService['kline']>>;
    try {
      kline = await this.marketData.kline(symbol, fetchCount, 'day');
    } catch (error) {
      summary.failed = true;
      this.logger.warn(`[日线全量] ${symbol} 上游 K 线全源失败: ${error instanceof Error ? error.message : String(error)}`);
      return summary;
    }
    if (kline.source !== 'eastmoney') {
      summary.skipped = true;
      summary.source = kline.source ?? 'unknown';
      this.logger.warn(`[日线全量] ${symbol} K 线来自降级源 ${summary.source}，整体放弃（存量分毫不动）`);
      return summary;
    }
    const drafts = (kline.items ?? [])
      .map((item) => klineToRow(symbol, item))
      .filter((row): row is BarRowDraft => row !== null);
    if (drafts.length === 0) {
      summary.failed = true;
      this.logger.warn(`[日线全量] ${symbol} 拉取结果无合法行，整体放弃（存量分毫不动）`);
      return summary;
    }
    summary.fetched = drafts.length;
    await this.barRepo.manager.transaction(async (manager) => {
      await manager.delete(StockDailyBar, { symbol });
      // 分块插入：sqlite 变量上限 999，9 列 × 1000 行整批必炸；100 行/块对两库都安全
      for (let i = 0; i < drafts.length; i += 100) {
        const chunk = drafts.slice(i, i + 100);
        await manager.insert(
          StockDailyBar,
          chunk.map((row) => ({
            symbol: row.symbol,
            tradeDate: row.tradeDate,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            amount: row.amount
          }))
        );
      }
    });
    summary.written = drafts.length;
    summary.anomalyRows = await this.warnQuality(symbol);
    return summary;
  }

  // ==================== 质量报表 ====================

  /** 概览：SQL GROUP BY 聚合（属性名 QueryBuilder），不做行级探针；零行标的 barCount=0 一并返回。 */
  async qualityOverview(query: QueryOverviewDto): Promise<QualityOverview> {
    const poolDays = this.poolDays();
    const { watchlistSymbols, screenerSymbols, names } = await this.resolveUniverse(poolDays);
    const pool = query.pool ?? 'all';
    const symbols =
      pool === 'watchlist'
        ? watchlistSymbols
        : pool === 'screener'
          ? screenerSymbols
          : [...new Set([...watchlistSymbols, ...screenerSymbols])];
    // 全表 GROUP BY（索引 (symbol, trade_date) 扫描）：比按宇宙 IN 大数组过滤稳（sqlite 参数上限）
    const groups = await this.barRepo
      .createQueryBuilder('bar')
      .select('bar.symbol', 'symbol')
      .addSelect('COUNT(bar.id)', 'barCount')
      .addSelect('MIN(bar.tradeDate)', 'firstDate')
      .addSelect('MAX(bar.tradeDate)', 'lastDate')
      .groupBy('bar.symbol')
      .getRawMany();
    const stats = new Map<string, { barCount: number; firstDate: string | null; lastDate: string | null }>();
    for (const row of groups) {
      stats.set(row.symbol, {
        barCount: Number(row.barCount),
        firstDate: row.firstDate != null ? this.isoFromStored(row.firstDate) : null,
        lastDate: row.lastDate != null ? this.isoFromStored(row.lastDate) : null
      });
    }
    // barsTotal = 全库口径（不随 pool 筛选收窄）：上方 GROUP BY 是全表扫描，库内行本就只属于
    // 被抓取过的标的；前端明细标签「库内日线 N 根」即此语义，改宇宙求和反而与 UI 不符（评审意见 1）。
    const barsTotal = [...stats.values()].reduce((sum, item) => sum + item.barCount, 0);
    const today0 = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const items: QualityOverviewItem[] = symbols.map((symbol) => {
      const one = stats.get(symbol);
      const lastDate = one?.lastDate ?? null;
      const staleDays = lastDate
        ? Math.floor((today0.getTime() - (toUtcMidnight(lastDate)?.getTime() ?? today0.getTime())) / DAY_MS)
        : 0;
      return {
        symbol,
        name: names.get(symbol) ?? '',
        barCount: one?.barCount ?? 0,
        firstDate: one?.firstDate ?? null,
        lastDate,
        staleDays: Math.max(0, staleDays)
      };
    });
    // 覆盖差的排前（barCount 升序，其次 staleDays 降序，末按 symbol 稳定序）
    items.sort(
      (a, b) =>
        a.barCount - b.barCount ||
        b.staleDays - a.staleDays ||
        (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0)
    );
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 100);
    return {
      universe: {
        watchlistSymbols: watchlistSymbols.length,
        screenerSymbols: screenerSymbols.length,
        barsTotal
      },
      total: symbols.length,
      items: items.slice((page - 1) * pageSize, page * pageSize)
    };
  }

  /** 明细：该标的全部行载入内存跑纯函数探针（单标的 ≤ ~1000 行，开销可控）。 */
  async qualityDetail(symbols: string[]): Promise<{ items: QualityDetailItem[] }> {
    const rows = await this.barRepo.find({
      where: { symbol: In(symbols) },
      order: { tradeDate: 'ASC' }
    });
    const bySymbol = new Map<string, QualityBarRow[]>();
    for (const row of rows) {
      const list = bySymbol.get(row.symbol) ?? [];
      list.push({
        date: isoDay(row.tradeDate),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume)
      });
      bySymbol.set(row.symbol, list);
    }
    const items = symbols.map((symbol) => {
      const summary = summarizeSymbolQuality(symbol, bySymbol.get(symbol) ?? [], {
        today: new Date(),
        autoWindowDays: this.autoWindowDays()
      });
      return summary;
    });
    return { items };
  }

  /** 手动触发是否在运行（trigger 端点 409 判定）。 */
  isRunning(): boolean {
    return this.running;
  }

  // ==================== 内部 ====================

  /** check-then-insert + 唯一冲突按唯一键 update 重试一次（照 publisher.service.ts 导入路径先例）。 */
  private async upsertBarRow(row: BarRowDraft): Promise<void> {
    const uniqueWhere = { symbol: row.symbol, tradeDate: row.tradeDate };
    const values = {
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      amount: row.amount
    };
    try {
      const existing = await this.barRepo.findOne({ where: uniqueWhere });
      if (!existing) {
        await this.barRepo.insert({ ...uniqueWhere, ...values });
        return;
      }
      await this.barRepo.update(uniqueWhere, values);
    } catch (error) {
      // check-then-insert 竞态（并发同键）命中唯一索引 → 按唯一键 update 重试一次
      const isUniqueConflict =
        error instanceof QueryFailedError && /UNIQUE|Duplicate|ER_DUP_ENTRY/i.test(error.message);
      if (!isUniqueConflict) {
        throw error;
      }
      await this.barRepo.update(uniqueWhere, values);
    }
  }

  /** 收尾质量探针：告警进日志，返回异常行数（不落库）。 */
  private async warnQuality(symbol: string): Promise<number> {
    const rows = await this.barRepo.find({ where: { symbol }, order: { tradeDate: 'ASC' } });
    const summary = summarizeSymbolQuality(
      symbol,
      rows.map((row) => ({
        date: isoDay(row.tradeDate),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume)
      })),
      { today: new Date(), autoWindowDays: this.autoWindowDays() }
    );
    if (summary.weekdayGaps.length > 0 || summary.anomalies.length > 0 || summary.suspiciousJumps.length > 0) {
      this.logger.warn(
        `[日线质量] ${symbol} bars=${summary.barCount} gaps=${summary.weekdayGaps.length} anomalies=${summary.anomalies.length} jumps=${summary.suspiciousJumps.length}（缺口按周一~五推断，法定节假日会误报）`
      );
    }
    return summary.anomalies.length;
  }

  private async universeSymbols(): Promise<string[]> {
    const { watchlistSymbols, screenerSymbols } = await this.resolveUniverse(this.poolDays());
    return [...new Set([...watchlistSymbols, ...screenerSymbols])];
  }

  /**
   * 聚合行日期归一：sqlite 原生聚合返回字符串 'YYYY-MM-DD HH:MM:SS.SSS'（本地 new Date 解析会
   * 偏移一天，实测探针证实），取前 10 位；mysql/实体水合返回 Date，走 isoDay（UTC 口径）。
   */
  private isoFromStored(value: unknown): string {
    if (value instanceof Date) {
      return isoDay(value);
    }
    return String(value).slice(0, 10);
  }

  private initBars(): number {
    return Number(process.env.STOCK_BARS_INIT_BARS ?? 250);
  }

  /** 质量探针 outsideAutoWindow 的窗口下界（日历天）：拉取根数→日历天保守换算。
   *  上游按「根数」取数，250 根实际回看 ≈350+ 日历天（周末+节假日），直接拿根数当日历天
   *  会把 ~250-355 天带内本可自动回补的缺口误标「窗口外」（评审意见 3 的单位混用）；
   *  换算因子 1.4 ≤ 真实跨度 → 残余误差方向保持保守（至多把紧贴真实回看边界的缺口多提示一次手动 full）。 */
  private autoWindowDays(): number {
    return barsToCalendarDays(this.initBars());
  }

  private poolDays(): number {
    return Number(process.env.STOCK_BARS_POOL_DAYS ?? 7);
  }

  private intervalMs(): number {
    return Number(process.env.STOCK_BARS_INTERVAL_MS ?? 300);
  }

  private maxPerRun(): number {
    return Number(process.env.STOCK_BARS_MAX_PER_RUN ?? 200);
  }
}
