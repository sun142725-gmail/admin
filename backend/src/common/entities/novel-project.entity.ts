// 小说转视频项目：源文本 + 生成配置 + 流水线状态（一键：分片→分镜→出图出视频→合成）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export interface NovelPipelineConfig {
  // 每章分镜数量（1-6）。
  shotsPerChapter: number;
  // 单个分镜视频时长（秒）。
  videoSeconds: number;
  // 首帧图尺寸。
  imageSize: string;
  // 视频分辨率（如 1280x720）。
  videoSize: string;
}

export const DEFAULT_NOVEL_CONFIG: NovelPipelineConfig = {
  shotsPerChapter: 3,
  videoSeconds: 5,
  imageSize: '1536x1024',
  videoSize: '1280x720'
};

// stage: split(分片完成) / storyboard(分镜中) / producing(出片中) / merging(合成中) / done
@Index(['status', 'id'])
@Entity('novel_projects')
export class NovelProject extends BaseEntity {
  @Column({ length: 64 })
  name!: string;

  // 原文（整本/片段/章节文本）。longtext 为 MySQL 专属类型，测试环境（sqlite）回退 text
  @Column({ type: process.env.NODE_ENV === 'test' ? 'text' : 'longtext' })
  sourceText!: string;

  // draft / running / completed / failed / cancelled
  @Column({ length: 16, default: 'draft' })
  status!: string;

  @Column({ length: 16, default: 'split' })
  stage!: string;

  // 全局画面风格提示词（追加到每个分镜首帧提示词后）。
  @Column({ name: 'style_prompt', type: 'text', nullable: true })
  stylePrompt?: string | null;

  @Column({ type: 'json' })
  config!: NovelPipelineConfig;

  // 合成成片的静态访问路径（/uploads/...）。
  @Column({ name: 'final_video_path', type: 'varchar', length: 255, nullable: true })
  finalVideoPath?: string | null;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  // 最近一次运行的进度描述（如「第 2/6 个分镜」）。
  @Column({ name: 'stage_message', type: 'varchar', length: 255, nullable: true })
  stageMessage?: string | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number | null;

  @Column({ name: 'created_by' })
  createdBy!: number;
}
