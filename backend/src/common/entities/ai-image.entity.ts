// AI 生图记录：保存用户生成图片的历史（远程 URL）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['userId'])
@Entity('ai_images')
export class AiImage extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ name: 'model_id', nullable: true })
  modelId?: number;

  @Column({ length: 500 })
  prompt!: string;

  @Column({ length: 32, nullable: true })
  size?: string;

  @Column({ length: 512 })
  url!: string;

  @Column({ length: 16, default: 'ok' })
  status!: string;
}
