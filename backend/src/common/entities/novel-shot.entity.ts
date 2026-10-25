// 小说分镜：一章 N 个分镜，每个分镜 = 首帧图 + 视频片段；全部完成后 ffmpeg 合成成片。
// 图片/片段统一落盘 uploads/novel-video/{projectId}/，用静态 URL 引用（避免大 JSON 行）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

// pending / image_done / video_done / failed
@Index(['projectId', 'chapterId', 'idx'])
@Entity('novel_shots')
export class NovelShot extends BaseEntity {
  @Column({ name: 'project_id' })
  projectId!: number;

  @Column({ name: 'chapter_id' })
  chapterId!: number;

  // 章节内序号（从 1 开始）。
  @Column()
  idx!: number;

  // 首帧画面提示词（英文）。
  @Column({ name: 'scene_prompt', type: 'text' })
  scenePrompt!: string;

  // 运动/镜头提示词（英文）。
  @Column({ name: 'motion_prompt', type: 'text' })
  motionPrompt!: string;

  // 旁白/台词（中文，供配音或字幕参考）。
  @Column({ type: 'text', nullable: true })
  narration?: string;

  @Column({ name: 'image_url', type: 'varchar', length: 255, nullable: true })
  imageUrl?: string | null;

  @Column({ name: 'video_url', type: 'varchar', length: 255, nullable: true })
  videoUrl?: string | null;

  // 本地片段文件相对 uploads 的路径（合成输入；OSS 外链会过期，落盘保 permanence）。
  @Column({ name: 'video_file', type: 'varchar', length: 255, nullable: true })
  videoFile?: string | null;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error?: string | null;

  @Column({ name: 'model_id', type: 'int', nullable: true })
  modelId?: number | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number | null;
}
