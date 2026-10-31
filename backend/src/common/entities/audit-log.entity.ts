// 审计日志实体用于记录关键操作。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('audit_logs')
@Index(['createdAt'])
@Index(['userId'])
@Index(['module'])
@Index(['traceId'])
export class AuditLog extends BaseEntity {
  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @Column()
  action!: string;

  @Column({ nullable: true })
  module?: string;

  @Column({ type: 'text', nullable: true })
  detail?: string;

  @Column({ nullable: true })
  ip?: string;

  // 请求链路 ID：TraceMiddleware 注入 ALS，AuditService 落库时自动带上，
  // 用于在日志中心按 traceId 串联"操作"与"当时的报错/前端日志"
  @Column({ name: 'trace_id', nullable: true })
  traceId?: string;
}
