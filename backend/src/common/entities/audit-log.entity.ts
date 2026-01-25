// 审计日志实体用于记录关键操作。
import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('audit_logs')
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
}
