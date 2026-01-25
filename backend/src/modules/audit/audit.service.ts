// 审计服务用于写入操作日志。
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../common/entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>
  ) {}

  async log(action: string, module: string, detail: string, userId?: number, ip?: string) {
    const audit = this.auditRepo.create({ action, module, detail, userId, ip });
    await this.auditRepo.save(audit);
  }

  async list(page = 1, pageSize = 20) {
    const [items, total] = await this.auditRepo.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items, total, page, pageSize };
  }
}
