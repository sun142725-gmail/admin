// 打点日志实体记录页面 PV 等埋点事件。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('track_logs')
@Index(['traceId'])
@Index(['sessionId'])
export class TrackLog extends BaseEntity {
  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @Column({ name: 'trace_id', nullable: true })
  traceId?: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId?: string;

  @Column({ nullable: true })
  source?: string;

  @Column({ name: 'page_code' })
  pageCode!: string;

  @Column()
  path!: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent?: string;

  @Column({ nullable: true })
  referrer?: string;
}
