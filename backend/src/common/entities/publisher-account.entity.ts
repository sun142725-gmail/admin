// 发布矩阵平台账号：凭据仅加密落库（AES-256-GCM），任何响应不得回传密文或明文。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

// 唯一索引 (platform, account_name)：并发重复创建靠 DB 约束兜底，check-then-insert 存在竞态窗口
@Index(['platform', 'accountName'], { unique: true })
@Entity('publisher_accounts')
export class PublisherAccount extends BaseEntity {
  // 平台标识：douyin / kuaishou / bilibili / channels / xhs / other（见 publisher.types）
  @Column({ length: 32 })
  platform!: string;

  @Column({ name: 'account_name', length: 128 })
  accountName!: string;

  // 密文（iv:tag:cipher 三段十六进制），仅加密落库，永不回传响应
  @Column({ name: 'credentials_encrypted', type: 'text', nullable: true })
  credentialsEncrypted?: string | null;

  // 1 启用 / 0 停用
  @Column({ default: 1 })
  status!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark?: string | null;
}
