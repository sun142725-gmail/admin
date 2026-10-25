// 小说章节：分片产物（按章节标题切分或按长度切分），分镜由 LLM 生成后挂在本章下。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

// pending / storyboarded / failed
@Index(['projectId', 'idx'])
@Entity('novel_chapters')
export class NovelChapter extends BaseEntity {
  @Column({ name: 'project_id' })
  projectId!: number;

  // 章节序号（从 1 开始）。
  @Column()
  idx!: number;

  @Column({ length: 128 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error?: string | null;
}
