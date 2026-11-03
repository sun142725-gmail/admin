// 平台数据回流：各发布平台按日手动导入的播放/互动指标（CSV 上传，无平台 API 抓取）。
// 幂等键 = (novel_project_id, platform, metric_date, video_id)：同键二次导入覆盖不重复插入；
// video_id 允许空串占位（按日整作汇总口径无单视频维度时），空串也是唯一索引合法值。
// 不建外键约束，查询层 join novel_projects（照 video-publish-record.entity.ts:1 先例，避免 sqlite/mysql 迁移差异）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['novelProjectId', 'platform', 'metricDate', 'videoId'], { unique: true })
@Entity('video_platform_metrics')
export class VideoPlatformMetric extends BaseEntity {
  // 关联 novel_projects.id（无外键，查询 join）
  @Index()
  @Column({ name: 'novel_project_id' })
  novelProjectId!: number;

  // 平台标识：douyin / kuaishou / bilibili / channels / xhs / other（见 publisher.types）
  @Column({ length: 32 })
  platform!: string;

  // 指标归属日：统一存 UTC 零点（跨库兼容照 video-publish-record.entity.ts:27 先例）
  @Column({ name: 'metric_date', type: 'datetime', precision: 6 })
  metricDate!: Date;

  // 平台视频 id：空值以空串占位入库（NOT NULL，保证唯一性语义完整）
  @Column({ name: 'video_id', type: 'varchar', length: 128 })
  videoId!: string;

  // 四项指标必须显式 int：否则 TypeORM 反射为 Object，sqlite 建表直接失败（AGENTS 双兼容条款）
  @Column({ type: 'int', default: 0 })
  views!: number;

  @Column({ type: 'int', default: 0 })
  likes!: number;

  @Column({ type: 'int', default: 0 })
  comments!: number;

  @Column({ type: 'int', default: 0 })
  follows!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark?: string | null;
}
