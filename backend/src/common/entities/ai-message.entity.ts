// AI 消息实体：对话内容与当次调用元数据（渠道/tokens/延迟）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['conversationId'])
@Entity('ai_messages')
export class AiMessage extends BaseEntity {
  @Column({ name: 'conversation_id' })
  conversationId!: number;

  @Column({ length: 16 })
  role!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'content_type', length: 16, default: 'text' })
  contentType!: string;

  @Column({ name: 'model_id', nullable: true })
  modelId?: number;


  @Column({ name: 'prompt_tokens', nullable: true })
  promptTokens?: number;

  @Column({ name: 'completion_tokens', nullable: true })
  completionTokens?: number;

  @Column({ name: 'latency_ms', nullable: true })
  latencyMs?: number;

  // ok / failed / stopped。
  @Column({ length: 16, default: 'ok' })
  status!: string;

  @Column({ name: 'error_message', length: 255, nullable: true })
  errorMessage?: string;
}
