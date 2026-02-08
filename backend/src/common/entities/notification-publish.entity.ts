// 通知发布实体记录发送任务与状态。
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { NotificationTemplate } from './notification-template.entity';

@Entity('notification_publishes')
export class NotificationPublish extends BaseEntity {
  @Column({ name: 'template_id' })
  templateId!: number;

  @ManyToOne(() => NotificationTemplate)
  @JoinColumn({ name: 'template_id' })
  template?: NotificationTemplate;

  @Column({ name: 'channel_type' })
  channelType!: string;

  @Column({ type: 'json', nullable: true })
  payload?: Record<string, unknown>;

  @Column()
  status!: string;

  @Column({ name: 'fail_reason', type: 'text', nullable: true })
  failReason?: string;

  @Column({ name: 'retry_count', default: 0 })
  retryCount!: number;

  @Column({ name: 'idempotency_key', nullable: true })
  idempotencyKey?: string;
}
