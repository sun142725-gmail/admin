// AI 用量日志：每次模型调用的计量记录（P1 出统计页，P0 先落库）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['userId'])
@Index(['createdAt'])
@Index(['projectId'])
@Entity('ai_usage_logs')
export class AiUsageLog extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  @Column({ name: 'model_id', nullable: true })
  modelId?: number;

  // 制片厂项目关联（novel_projects.id）：仅制片厂管线调用传入，流程引擎/对话等为 null。
  @Column({ name: 'project_id', nullable: true })
  projectId?: number;

  // 数量基准：image=张 / video=秒 / tts=字符 / chat 恒 0；失败调用记 0（金额只由该列与 tokens 驱动）。
  @Column({ name: 'unit_count', default: 0 })
  unitCount!: number;


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
