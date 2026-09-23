// 审计服务用于写入操作日志。
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../common/entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>
  ) {}

  /**
   * 审计为旁路能力：写入失败只告警，不影响业务结果
   * （否则"业务已成功 + 响应 500"会让用户重试时遭遇唯一约束冲突）。
   */
  async log(action: string, module: string, detail: string, userId?: number, ip?: string) {
    try {
      const audit = this.auditRepo.create({ action, module, detail, userId, ip });
      await this.auditRepo.save(audit);
    } catch (error) {
      this.logger.error(`审计日志写入失败 action=${action} module=${module}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
