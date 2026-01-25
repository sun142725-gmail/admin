// 日志中心服务负责查询与详情。
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AuditLog } from '../../common/entities/audit-log.entity';
import { QueryAuditDto } from './dto/query-audit.dto';

@Injectable()
export class AuditCenterService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>
  ) {}

  async list(query: QueryAuditDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: Record<string, any> = {};

    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.module) {
      where.module = query.module;
    }
    if (query.start && query.end) {
      where.createdAt = Between(new Date(query.start), new Date(query.end));
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
