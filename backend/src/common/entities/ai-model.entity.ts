// AI 模型实体：一行 = 一个可调用端点（协议 + 地址 + 密钥），model_key 相同的多行互为备份。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

// 同一 model_key 可挂多家上游（baseUrl 不同），同地址同模型不允许重复注册。
@Index('uk_model_key_baseurl', ['modelKey', 'baseUrl'], { unique: true })
@Index(['modelKey', 'priority'])
@Entity('ai_models')
export class AiModel extends BaseEntity {
  // 对外模型名：请求上游时的 model 参数；多行同名即互为备份。
  @Column({ name: 'model_key', length: 64 })
  modelKey!: string;

  @Column({ name: 'display_name', length: 64 })
  displayName!: string;

  // 协议类型：openai-compatible / ollama（预留）。
  @Column({ length: 32, default: 'openai-compatible' })
  type!: string;

  // 上游请求地址，如 https://api.deepseek.com/v1。
  @Column({ name: 'base_url', length: 255 })
  baseUrl!: string;

  // AES 加密后的 API Key，永不回传明文。
  @Column({ name: 'api_key_cipher', length: 512 })
  apiKeyCipher!: string;

  // 脱敏展示用，如 sk-****abcd。
  @Column({ name: 'api_key_mask', length: 64 })
  apiKeyMask!: string;

  // 能力标签，逗号分隔：chat,image,vision,embedding。
  @Column({ length: 128, default: 'chat' })
  capabilities!: string;

  @Column({ name: 'context_length', default: 8192 })
  contextLength!: number;

  @Column({ name: 'max_output', default: 4096 })
  maxOutput!: number;

  // 路由：数字越大越优先；同级按 weight 随机分流。
  @Column({ default: 0 })
  priority!: number;

  @Column({ default: 1 })
  weight!: number;

  // 默认采样参数 JSON：{ temperature, topP, maxTokens }。
  @Column({ name: 'default_params', type: 'json', nullable: true })
  defaultParams?: Record<string, unknown> | null;

  @Column({ default: 1 })
  status!: number;

  @Column({ nullable: true })
  remark?: string;
}
