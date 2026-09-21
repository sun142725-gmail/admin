// AI 用量日志：每次模型调用的计量记录（P1 出统计页，P0 先落库）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['userId'])
@Index(['createdAt'])
@Entity('ai_usage_logs')
export class AiUsageLog extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ name: 'model_id', nullable: true })
  modelId?: number;


  // chat / image。
  @Column({ length: 16 })
  kind!: string;

  @Column({ name: 'prompt_tokens', default: 0 })
  promptTokens!: number;

  @Column({ name: 'completion_tokens', default: 0 })
  completionTokens!: number;

  @Column({ name: 'total_tokens', default: 0 })
  totalTokens!: number;

  @Column({ name: 'latency_ms', nullable: true })
  latencyMs?: number;

  @Column({ length: 16, default: 'ok' })
  status!: string;

  @Column({ name: 'error_message', length: 255, nullable: true })
  errorMessage?: string;
}
