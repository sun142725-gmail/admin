// 发布记录：手动登记发布结果（manual 通道）；不建外键约束，查询层 join 项目/账号（照仓库现状，避免 sqlite/mysql 迁移差异）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('video_publish_records')
export class VideoPublishRecord extends BaseEntity {
  // 关联 novel_projects.id（无外键，查询 join）
  @Index()
  @Column({ name: 'novel_project_id' })
  novelProjectId!: number;

  @Column({ length: 32 })
  platform!: string;

  // 关联 publisher_accounts.id，可空（other 平台无账号语义）
  // 联合类型必须显式 int：否则 TypeORM 反射为 Object，sqlite 建表直接失败（AGENTS 双兼容条款）
  @Column({ name: 'account_id', type: 'int', nullable: true })
  accountId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string | null;

  // manual 通道登记即 published；未来平台 API 通道可扩展 failed/pending 等状态
  @Column({ length: 16, default: 'published' })
  status!: string;

  @Column({ name: 'published_at', type: 'datetime', precision: 6 })
  publishedAt!: Date;

  // 发布回执链接（平台作品页 URL/短链）
  @Column({ name: 'receipt_url', type: 'varchar', length: 500, nullable: true })
  receiptUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;
}
