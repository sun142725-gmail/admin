// 前端日志实体记录浏览器侧日志与接口调用信息。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('frontend_logs')
@Index(['traceId'])
@Index(['sessionId'])
export class FrontendLog extends BaseEntity {
  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @Column({ name: 'trace_id', nullable: true })
  traceId?: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId?: string;

  @Column({ nullable: true })
  source?: string;

  @Column()
  level!: string;

  @Column({ nullable: true })
  category?: string;

  @Column()
  message!: string;

  @Column({ type: 'text', nullable: true })
  stack?: string;

  @Column({ type: 'json', nullable: true })
  meta?: Record<string, unknown>;
}
