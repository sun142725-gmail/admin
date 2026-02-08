// 站内信消息实体用于记录用户可见的通知。
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { NotificationPublish } from './notification-publish.entity';
import { User } from './user.entity';

@Entity('notification_messages')
@Index(['userId'])
@Index(['publishId'])
export class NotificationMessage extends BaseEntity {
  @Column({ name: 'publish_id' })
  publishId!: number;

  @ManyToOne(() => NotificationPublish)
  @JoinColumn({ name: 'publish_id' })
  publish?: NotificationPublish;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ default: 'unread' })
  status!: string;

  @Column({ name: 'read_at', nullable: true })
  readAt?: Date;
}
