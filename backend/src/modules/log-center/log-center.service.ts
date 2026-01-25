// 日志中心服务负责写入与查询多类型日志。
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Like, Repository } from 'typeorm';
import { TrackLog } from '../../common/entities/track-log.entity';
import { FrontendLog } from '../../common/entities/frontend-log.entity';
import { ErrorLog } from '../../common/entities/error-log.entity';
import { BatchEventsDto } from './dto/batch-events.dto';
import { QueryLogDto } from './dto/query-log.dto';

type LogType = 'track' | 'frontend' | 'error';

@Injectable()
export class LogCenterService {
  constructor(
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
  ): Promise<{ accepted: number }> {
    const source = payload.source;
    const sessionId = payload.sessionId;
    const events = payload.events ?? [];

    const trackLogs: TrackLog[] = [];
    const frontendLogs: FrontendLog[] = [];
    const errorLogs: ErrorLog[] = [];

    events.forEach((event) => {
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

    if (trackLogs.length) {
      await this.trackRepo.save(trackLogs);
    }
    if (frontendLogs.length) {
      await this.frontendRepo.save(frontendLogs);
    }
    if (errorLogs.length) {
      await this.errorRepo.save(errorLogs);
    }

    return { accepted: events.length };
  }

  async list(query: QueryLogDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { start, end } = this.normalizeRange(query.start, query.end);
    const skip = (page - 1) * pageSize;

    if (query.type === 'track') {
      const where: FindOptionsWhere<TrackLog> = {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.traceId ? { traceId: query.traceId } : {}),
        ...(query.sessionId ? { sessionId: query.sessionId } : {}),
        ...(query.pageCode ? { pageCode: query.pageCode } : {}),
        ...(start && end ? { createdAt: Between(start, end) } : {})
      };
      const [items, total] = await this.trackRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip,
        take: pageSize
      });
      return { items, total };
    }

    if (query.type === 'frontend') {
      const where: FindOptionsWhere<FrontendLog> = {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.traceId ? { traceId: query.traceId } : {}),
        ...(query.sessionId ? { sessionId: query.sessionId } : {}),
        ...(query.level ? { level: query.level } : {}),
        ...(query.keyword ? { message: Like(`%${query.keyword}%`) } : {}),
        ...(start && end ? { createdAt: Between(start, end) } : {})
      };
      const [items, total] = await this.frontendRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip,
        take: pageSize
      });
      return { items, total };
    }

    const where: FindOptionsWhere<ErrorLog> = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.traceId ? { traceId: query.traceId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.keyword ? { message: Like(`%${query.keyword}%`) } : {}),
      ...(start && end ? { createdAt: Between(start, end) } : {})
    };
    const [items, total] = await this.errorRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize
    });
    return { items, total };
  }

  async detail(type: LogType, id: number) {
    const { start, end } = this.normalizeRange();
    if (type === 'track') {
      const item = await this.trackRepo.findOne({
        where: { id, ...(start && end ? { createdAt: Between(start, end) } : {}) }
      });
      if (!item) {
        throw new NotFoundException('日志不存在');
      }
      return item;
    }
    if (type === 'frontend') {
      const item = await this.frontendRepo.findOne({
        where: { id, ...(start && end ? { createdAt: Between(start, end) } : {}) }
      });
      if (!item) {
        throw new NotFoundException('日志不存在');
      }
      return item;
    }
    const item = await this.errorRepo.findOne({
      where: { id, ...(start && end ? { createdAt: Between(start, end) } : {}) }
    });
    if (!item) {
      throw new NotFoundException('日志不存在');
    }
    return item;
  }

  async cleanupExpired(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await this.trackRepo.delete({ createdAt: Between(new Date(0), cutoff) });
    await this.frontendRepo.delete({ createdAt: Between(new Date(0), cutoff) });
    await this.errorRepo.delete({ createdAt: Between(new Date(0), cutoff) });
  }

  private normalizeRange(start?: string, end?: string) {
    const now = new Date();
    const limitStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let rangeStart = start ? new Date(start) : limitStart;
    let rangeEnd = end ? new Date(end) : now;
    if (rangeStart < limitStart) {
      rangeStart = limitStart;
    }
    if (rangeEnd > now) {
      rangeEnd = now;
    }
    return { start: rangeStart, end: rangeEnd };
  }
}
