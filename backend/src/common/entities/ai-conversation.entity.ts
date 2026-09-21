// AI 会话实体：agent_id 与 model_id 二选一（智能体对话 / 裸模型对话）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['userId'])
@Entity('ai_conversations')
export class AiConversation extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ name: 'agent_id', nullable: true })
  agentId?: number;

  @Column({ name: 'model_id', nullable: true })
  modelId?: number;

  @Column({ length: 64, default: '新对话' })
  title!: string;

  @Column({ default: 1 })
  status!: number;
}
