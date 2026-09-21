// AI 智能体实体：native=内置提示词编排（绑模型）；dify=远程 Dify 应用（自带端点与密钥）。
import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('ai_agents')
export class AiAgent extends BaseEntity {
  @Column({ length: 64 })
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ length: 16, default: 'native' })
  kind!: string;

  // native 必填：绑定的模型。
  @Column({ name: 'model_id', nullable: true })
  modelId?: number;

  // dify 必填：应用 API 端点（如 https://api.dify.ai/v1）。
  @Column({ name: 'base_url', length: 255, nullable: true })
  baseUrl?: string;

  // dify 必填：应用 API Key（app-xxx，AES 加密落库）。
  @Column({ name: 'api_key_cipher', length: 512, nullable: true })
  apiKeyCipher?: string;

  @Column({ name: 'api_key_mask', length: 64, nullable: true })
  apiKeyMask?: string;

  // 系统提示词（native 的知识承载）。
  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt?: string;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0.7 })
  temperature!: string;

  @Column({ type: 'decimal', precision: 4, scale: 2, nullable: true })
  topP?: string;

  @Column({ name: 'max_tokens', nullable: true })
  maxTokens?: number;

  @Column({ name: 'opening_line', length: 255, nullable: true })
  openingLine?: string;

  @Column({ name: 'allow_image', default: 0 })
  allowImage!: number;

  @Column({ default: 0 })
  sort!: number;

  @Column({ default: 1 })
  status!: number;
}
