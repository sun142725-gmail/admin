// 日志中心服务负责写入与查询多类型日志。
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Brackets, DataSource, FindOptionsWhere, LessThan, MoreThan, Repository } from 'typeorm';
import { TrackLog } from '../../common/entities/track-log.entity';
import { FrontendLog } from '../../common/entities/frontend-log.entity';
import { ErrorLog } from '../../common/entities/error-log.entity';
import { BatchEventsDto } from './dto/batch-events.dto';
import { QueryLogDto } from './dto/query-log.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { QueryStatsDto } from './dto/query-stats.dto';

type LogType = 'track' | 'frontend' | 'error';

// 单条事件 payload 字符上限：超限事件跳过而不整批拒绝，避免一条坏数据毒化整批上报
const MAX_PAYLOAD_CHARS = 4000;
// 单批写入条数上限（与 BatchEventsDto.ArrayMaxSize 对齐）
const MAX_BATCH_EVENTS = 50;
// 清理任务单批删除条数：避免大表一次性删除造成长事务锁表
const CLEANUP_BATCH_SIZE = 500;
// 链路聚合单类日志返回上限：一条请求链路的事件数远小于此，兜底防止单 traceId 刷屏拖垮响应
const TRACE_TAKE = 200;

// 保留期（天）统一读取环境变量：查询窗口与清理任务必须一致，否则会出现"查得到但已清理/清理了却查不到"的错位
const retentionDays = () => {
  const days = Number(process.env.LOG_RETENTION_DAYS ?? 7);
  return Number.isFinite(days) && days > 0 ? days : 7;
};

@Injectable()
export class LogCenterService {
  private readonly logger = new Logger(LogCenterService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TrackLog)
    private readonly trackRepo: Repository<TrackLog>,
    @InjectRepository(FrontendLog)
    private readonly frontendRepo: Repository<FrontendLog>,
    @InjectRepository(ErrorLog)
    private readonly errorRepo: Repository<ErrorLog>
  ) {}

  async ingestEvents(
    payload: BatchEventsDto,
    userId?: number
  ): Promise<{ accepted: number; skipped: number }> {
    const source = payload.source;
    const sessionId = payload.sessionId;
    const events = (payload.events ?? []).slice(0, MAX_BATCH_EVENTS);

    const trackLogs: TrackLog[] = [];
    const frontendLogs: FrontendLog[] = [];
    const errorLogs: ErrorLog[] = [];
    let skipped = 0;

    events.forEach((event) => {
      // 服务端兜底：payload 无法在 DTO 层限制大小，超限事件跳过并计数
      if (JSON.stringify(event.payload ?? {}).length > MAX_PAYLOAD_CHARS) {
        skipped += 1;
        return;
      }
      if (event.type === 'track') {
        const data = event.payload as Record<string, string>;
        trackLogs.push(
          this.trackRepo.create({
            userId,
            traceId: event.traceId,
            sessionId,
            source,
            pageCode: data.pageCode ?? 'unknown',
            path: data.path ?? '',
            userAgent: data.userAgent,
            referrer: data.referrer
          })
        );
      }
      if (event.type === 'frontend') {
        const data = event.payload as Record<string, unknown>;
        frontendLogs.push(
          this.frontendRepo.create({
            userId,
            traceId: event.traceId,
            sessionId,
            source,
            level: String(data.level ?? 'info'),
            category: typeof data.category === 'string' ? data.category : undefined,
            message: String(data.message ?? ''),
            stack: typeof data.stack === 'string' ? data.stack : undefined,
            meta:
              data.meta && typeof data.meta === 'object'
                ? (data.meta as Record<string, unknown>)
                : undefined
          })
        );
      }
      if (event.type === 'error') {
        const data = event.payload as Record<string, unknown>;
        errorLogs.push(
          this.errorRepo.create({
            userId,
            traceId: event.traceId,
            sessionId,
            source,
            message: String(data.message ?? ''),
            stack: typeof data.stack === 'string' ? data.stack : undefined,
            meta:
              data.meta && typeof data.meta === 'object'
                ? (data.meta as Record<string, unknown>)
                : undefined
          })
        );
      }
    });

    // 单事务写入三类日志：要么整批成功，要么整批失败。部分成功 + 前端重试会造成重复日志
    const accepted = trackLogs.length + frontendLogs.length + errorLogs.length;
    if (accepted > 0) {
      await this.dataSource.transaction(async (manager) => {
        if (trackLogs.length) {
          await manager.save(trackLogs);
        }
        if (frontendLogs.length) {
          await manager.save(frontendLogs);
        }
        if (errorLogs.length) {
          await manager.save(errorLogs);
        }
      });
    }
    if (skipped > 0) {
      this.logger.warn(`日志上报跳过 ${skipped} 条超限事件（payload > ${MAX_PAYLOAD_CHARS} 字符）`);
    }

    return { accepted, skipped };
  }

  async list(query: QueryLogDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { start, end, clamped } = this.normalizeRange(query.start, query.end);
    const skip = (page - 1) * pageSize;

    if (query.type === 'track') {
      const where: FindOptionsWhere<TrackLog> = {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.traceId ? { traceId: query.traceId } : {}),
        ...(query.sessionId ? { sessionId: query.sessionId } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.pageCode ? { pageCode: query.pageCode } : {}),
        ...(start && end ? { createdAt: Between(start, end) } : {})
      };
      const [items, total] = await this.trackRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip,
        take: pageSize
      });
      return { items, total, retentionDays: retentionDays(), clamped };
    }

    if (query.type === 'frontend') {
      // 关键字需要命中 message 或 stack（OR 语义），FindOptionsWhere 表达不了，改用 QueryBuilder
      const qb = this.frontendRepo
        .createQueryBuilder('f')
        .where('f.created_at BETWEEN :start AND :end', { start, end });
      if (query.userId) {
        qb.andWhere('f.user_id = :userId', { userId: query.userId });
      }
      if (query.traceId) {
        qb.andWhere('f.trace_id = :traceId', { traceId: query.traceId });
      }
      if (query.sessionId) {
        qb.andWhere('f.session_id = :sessionId', { sessionId: query.sessionId });
      }
      if (query.source) {
        qb.andWhere('f.source = :source', { source: query.source });
      }
      if (query.level) {
        qb.andWhere('f.level = :level', { level: query.level });
      }
      if (query.keyword) {
        qb.andWhere(
          new Brackets((sub) => {
            sub.where('f.message LIKE :keyword').orWhere('f.stack LIKE :keyword');
          }),
          { keyword: `%${query.keyword}%` }
        );
      }
      qb.orderBy('f.created_at', 'DESC').skip(skip).take(pageSize);
      const [items, total] = await qb.getManyAndCount();
      return { items, total, retentionDays: retentionDays(), clamped };
    }

    const qb = this.errorRepo
      .createQueryBuilder('e')
      .where('e.created_at BETWEEN :start AND :end', { start, end });
    if (query.userId) {
      qb.andWhere('e.user_id = :userId', { userId: query.userId });
    }
    if (query.traceId) {
      qb.andWhere('e.trace_id = :traceId', { traceId: query.traceId });
    }
    if (query.sessionId) {
      qb.andWhere('e.session_id = :sessionId', { sessionId: query.sessionId });
    }
    if (query.source) {
      qb.andWhere('e.source = :source', { source: query.source });
    }
    if (query.keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('e.message LIKE :keyword').orWhere('e.stack LIKE :keyword');
        }),
        { keyword: `%${query.keyword}%` }
      );
    }
    qb.orderBy('e.created_at', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, retentionDays: retentionDays(), clamped };
  }

  // 链路聚合：同一 traceId 串联打点/前端/服务端错误三类日志，按时间正序返回，
  // 供前端一次拉取全链路时间线（审计日志无 traceId 列，不参与聚合）
  async trace(traceId: string) {
    const take = TRACE_TAKE;
    const [track, frontend, error] = await Promise.all([
      this.trackRepo.find({
        where: { traceId },
        order: { createdAt: 'ASC' },
        take
      }),
      this.frontendRepo.find({
        where: { traceId },
        order: { createdAt: 'ASC' },
        take
      }),
      this.errorRepo.find({
        where: { traceId },
        order: { createdAt: 'ASC' },
        take
      })
    ]);
    return { traceId, track, frontend, error };
  }

  async detail(type: LogType, id: number) {
    // 详情按 id 精确查询即可：列表已受保留期约束，此处再套时间窗会把边界数据变成"列表可见、详情 404"
    const repo =
      type === 'track' ? this.trackRepo : type === 'frontend' ? this.frontendRepo : this.errorRepo;
    const item = await repo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('日志不存在');
    }
    return item;
  }

  async cleanupExpired(days = retentionDays()) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const summary: Record<string, number> = {};
    for (const [name, repo] of [
      ['track_logs', this.trackRepo],
      ['frontend_logs', this.frontendRepo],
      ['error_logs', this.errorRepo]
    ] as const) {
      let deleted = 0;
      // 分批删除：大表一次性 DELETE 会造成长事务与间隙锁（DeleteQueryBuilder 无 limit 类型支持，按 id 分批等价）
      for (;;) {
        const rows = await repo.find({
          select: { id: true },
          where: { createdAt: LessThan(cutoff) },
          take: CLEANUP_BATCH_SIZE
        });
        if (!rows.length) {
          break;
        }
        await repo.delete(rows.map((row) => row.id));
        deleted += rows.length;
        if (rows.length < CLEANUP_BATCH_SIZE) {
          break;
        }
      }
      summary[name] = deleted;
    }
    this.logger.log(`日志清理完成（保留 ${days} 天）：${JSON.stringify(summary)}`);
    return summary;
  }

  // 返回值带 clamped 标记：调用方显式传入早于保留窗口的 start 时告知前端"范围已被收敛"，
  // 否则用户会误把"查不到"当成"没发生"
  // 概览统计：趋势/Top 聚合全部限定在请求窗口内，且窗口不能超过保留期（超出部分必然为空，只会误导）。
  // 按天分组用 substr(created_at,1,10)：MySQL 与 sqlite 均支持 substr，且免依赖各库不同的日期函数
  async stats(query: QueryStatsDto) {
    const days = Math.min(Math.max(query.days ?? 7, 1), retentionDays());
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trend = async (repo: Repository<TrackLog | FrontendLog | ErrorLog>, alias: string) =>
      repo
        .createQueryBuilder(alias)
        .select(`substr(${alias}.created_at, 1, 10)`, 'day')
        .addSelect('count(*)', 'count')
        .where(`${alias}.created_at >= :start`, { start })
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany<{ day: string; count: number }>();

    const [errorTrend, pvTrend, frontendTrend] = await Promise.all([
      trend(this.errorRepo, 'e'),
      trend(this.trackRepo, 't'),
      trend(this.frontendRepo, 'f')
    ]);

    const [topErrors, topSlowRequests, topPages, errorBySource] = await Promise.all([
      this.errorRepo
        .createQueryBuilder('e')
        .select('substr(e.message, 1, 120)', 'message')
        .addSelect('count(*)', 'count')
        .addSelect('min(e.created_at)', 'firstSeen')
        .addSelect('max(e.created_at)', 'lastSeen')
        .where('e.created_at >= :start', { start })
        .groupBy('message')
        .orderBy('count', 'DESC')
        .take(10)
        .getRawMany<{ message: string; count: number; firstSeen: string; lastSeen: string }>(),
      this.frontendRepo
        .createQueryBuilder('f')
        .select('f.message', 'message')
        .addSelect('count(*)', 'count')
        .addSelect('max(f.created_at)', 'lastSeen')
        .where('f.created_at >= :start', { start })
        .andWhere('f.level = :level', { level: 'warn' })
        .andWhere('f.message LIKE :prefix', { prefix: '慢请求%' })
        .groupBy('f.message')
        .orderBy('count', 'DESC')
        .take(10)
        .getRawMany<{ message: string; count: number; lastSeen: string }>(),
      this.trackRepo
        .createQueryBuilder('t')
        .select('t.page_code', 'pageCode')
        .addSelect('count(*)', 'count')
        .where('t.created_at >= :start', { start })
        .groupBy('t.page_code')
        .orderBy('count', 'DESC')
        .take(10)
        .getRawMany<{ pageCode: string; count: number }>(),
      this.errorRepo
        .createQueryBuilder('e')
        .select('e.source', 'source')
        .addSelect('count(*)', 'count')
        .where('e.created_at >= :start', { start })
        .groupBy('e.source')
        .getRawMany<{ source: string | null; count: number }>()
    ]);

    return {
      days,
      start,
      errorTrend,
      pvTrend,
      frontendTrend,
      topErrors,
      topSlowRequests,
      topPages,
      errorBySource
    };
  }

  // 会话链路：一个 sessionId 在窗口内的全部事件（打点/前端/错误，含服务端 5xx），按时间正序返回，
  // 供前端按天分组还原"用户整个流程的请求"；窗口默认与保留期一致，可选按来源过滤
  async sessionTrace(sessionId: string, query: QuerySessionDto) {
    const days = Math.min(Math.max(query.days ?? 7, 1), retentionDays());
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const take = TRACE_TAKE;
    const where = (extra: Record<string, unknown> = {}) => ({
      sessionId,
      createdAt: MoreThan(start),
      ...extra
    });
    const [track, frontend, error] = await Promise.all([
      this.trackRepo.find({ where: where(query.source ? { source: query.source } : {}), order: { createdAt: 'ASC' }, take }),
      this.frontendRepo.find({ where: where(query.source ? { source: query.source } : {}), order: { createdAt: 'ASC' }, take }),
      this.errorRepo.find({ where: where(query.source ? { source: query.source } : {}), order: { createdAt: 'ASC' }, take })
    ]);
    return { sessionId, days, track, frontend, error };
  }

  private normalizeRange(start?: string, end?: string) {
    const now = new Date();
    const days = retentionDays();
    const limitStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    let rangeStart = start ? new Date(start) : limitStart;
    let rangeEnd = end ? new Date(end) : now;
    // 非法日期回退默认窗口，避免 Invalid Date 传给 TypeORM 抛驱动级异常
    if (Number.isNaN(rangeStart.getTime())) {
      rangeStart = limitStart;
    }
    if (Number.isNaN(rangeEnd.getTime())) {
      rangeEnd = now;
    }
    const clamped = rangeStart < limitStart;
    if (rangeStart < limitStart) {
      rangeStart = limitStart;
    }
    if (rangeEnd > now) {
      rangeEnd = now;
    }
    return { start: rangeStart, end: rangeEnd, clamped };
  }
}
