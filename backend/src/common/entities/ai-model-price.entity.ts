// AI 模型单价表：按（模型行 | 调用类型）× 生效时间维护价目，报表计价与兜底顺序见 usage-cost.util。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['modelId'])
@Index(['kind'])
@Entity('ai_model_prices')
export class AiModelPrice extends BaseEntity {
  // 关联 ai_models.id；null = 该 kind 的全局价（模型行未配置价时回落）。
  @Column({ name: 'model_id', nullable: true })
  modelId?: number;

  // chat / image / video / tts。
  @Column({ length: 16 })
  kind!: string;

  // chat：每 1K 输入 token 单价；非 chat 恒 0（每单位数量价承载在 output_price，口径见 usage-cost.util）。
  @Column({ name: 'input_price', type: 'decimal', precision: 12, scale: 6, default: 0 })
  inputPrice!: string;

  // chat：每 1K 输出 token 单价；image/video/tts：每单位数量（张/秒/字符）单价。
  @Column({ name: 'output_price', type: 'decimal', precision: 12, scale: 6, default: 0 })
  outputPrice!: string;

  // 计价单位：tokens_1k / image / second / char（缺省由 kind 决定，见 usage-cost.util.DEFAULT_UNIT_BY_KIND）。
  @Column({ length: 16, default: 'tokens_1k' })
  unit!: string;

  @Column({ length: 8, default: 'CNY' })
  currency!: string;

  // 生效时间：报表按「用量时间 ≤ effective_from 的最新一行」取价（裸 datetime 跨库兼容，先例 novel-project.startedAt）。
  @Column({ name: 'effective_from', type: 'datetime' })
  effectiveFrom!: Date;

  @Column({ length: 255, nullable: true })
  remark?: string;
}
