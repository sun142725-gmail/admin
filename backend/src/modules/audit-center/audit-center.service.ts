// 审计中心服务负责操作审计日志的查询与详情。
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThan, MoreThan, Repository } from 'typeorm';
import { AuditLog } from '../../common/entities/audit-log.entity';
import { QueryAuditDto } from './dto/query-audit.dto';

@Injectable()
export class AuditCenterService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>
  ) {}

  async list(query: QueryAuditDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: FindOptionsWhere<AuditLog> = {};

    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.module) {
      where.module = query.module;
    }
    if (query.action) {
      where.action = query.action;
    }
    // 支持单边时间范围；非法日期直接忽略，避免驱动层异常
    const start = query.start ? new Date(query.start) : null;
    const end = query.end ? new Date(query.end) : null;
    const startValid = start && !Number.isNaN(start.getTime());
    const endValid = end && !Number.isNaN(end.getTime());
    if (startValid && endValid) {
      where.createdAt = Between(start as Date, end as Date);
    } else if (startValid) {
      where.createdAt = MoreThan(start as Date);
    } else if (endValid) {
      where.createdAt = LessThan(end as Date);
    }

    const [items, total] = await this.auditRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return { items, total, page, pageSize };
  }

  async detail(id: number) {
    const item = await this.auditRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('日志不存在');
    }
    return item;
  }
}
