// AI 管理端 DTO：模型（含端点与密钥）与智能体。
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export class CreateModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  modelKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  displayName!: string;

  @IsIn(['openai-compatible', 'ollama'])
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  apiKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  capabilities?: string;

  @IsOptional()
  @IsInt()
  @Min(512)
  contextLength?: number;

  @IsOptional()
  @IsInt()
  @Min(64)
  maxOutput?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsIn(['openai-compatible', 'ollama'])
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseUrl?: string;

  // 可选：留空表示不修改密钥。
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  capabilities?: string;

  @IsOptional()
  @IsInt()
  @Min(512)
  contextLength?: number;

  @IsOptional()
  @IsInt()
  @Min(64)
  maxOutput?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}

export class CreateAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsIn(['native', 'dify'])
  kind!: string;

  @IsOptional()
  @IsInt()
  modelId?: number;

  // dify 必填：应用端点与密钥。
  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string;

  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @Min(0)
  @Max(1)
  topP?: number;

  @IsOptional()
  @IsInt()
  @Min(64)
  maxTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  openingLine?: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  allowImage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsIn(['native', 'dify'])
  kind?: string;

  @IsOptional()
  @IsInt()
  modelId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseUrl?: string;

  // 可选：留空表示不修改密钥。
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  systemPrompt?: string;

  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @Min(0)
  @Max(1)
  topP?: number;

  @IsOptional()
  @IsInt()
  @Min(64)
  maxTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  openingLine?: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  allowImage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}
