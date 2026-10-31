// AI 画布快照实体：每用户一行（userId 唯一索引），保存生图画布的节点与视口快照。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('ai_canvases')
@Index(['userId'], { unique: true })
export class AiCanvas extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  // 画布快照（CanvasSnapshot 结构：version/nodes/viewport），json 列与 sqlite 兼容
  //（flow-definition.entity.ts 的 dag 列同款口径）。
  @Column({ type: 'json' })
  snapshot!: Record<string, unknown>;
}
