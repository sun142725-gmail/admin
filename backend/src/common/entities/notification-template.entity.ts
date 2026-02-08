// 通知模板实体用于存储模板内容与变量定义。
import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
interface NotificationVariableDefinition {
  key: string;
  label: string;
  source: string;
  required?: boolean;
}

@Entity('notification_templates')
export class NotificationTemplate extends BaseEntity {
  @Column()
  name!: string;

  @Column({ name: 'channel_types', type: 'json' })
  channelTypes!: string[];

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'json', nullable: true })
  variables?: NotificationVariableDefinition[];

  @Column({ default: 1 })
  status!: number;
}
