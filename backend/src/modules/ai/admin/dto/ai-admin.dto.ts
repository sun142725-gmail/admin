// AI 管理端 DTO：模型（含端点与密钥）、智能体与模型单价。
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
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

  // 扩展参数：视频模型可指定 {"protocol":"dashscope"} 走百炼异步任务协议。
  @IsOptional()
  @IsObject()
  defaultParams?: Record<string, unknown>;

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

  // 扩展参数（对象整体覆盖，传 null 清空）。
  @IsOptional()
  @IsObject()
  defaultParams?: Record<string, unknown> | null;

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

  // 业务编码：业务模块对接锚点，如 divination。
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]*$/, { message: '业务编码须以小写字母开头，仅含小写字母/数字/中划线/下划线' })
  @MaxLength(64)
  code?: string;

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

  // 业务编码：业务模块对接锚点，如 divination。
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]*$/, { message: '业务编码须以小写字母开头，仅含小写字母/数字/中划线/下划线' })
  @MaxLength(64)
  code?: string;

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

// ---------- 模型单价（成本核算） ----------
const PRICE_KINDS = ['chat', 'image', 'video', 'tts'];
const PRICE_UNITS = ['tokens_1k', 'image', 'second', 'char'];

export class CreateModelPriceDto {
  // 关联模型行；不传 = 该 kind 全局价。
  @IsOptional()
  @IsInt()
  modelId?: number;

  @IsIn(PRICE_KINDS)
  kind!: string;

  // chat：每 1K 输入 token 单价；非 chat 恒 0（缺省 0）。
  @IsOptional()
  @IsNumber()
  @Min(0)
  inputPrice?: number;

  // chat：每 1K 输出 token 单价；image/video/tts：每单位数量单价（缺省 0）。
  @IsOptional()
  @IsNumber()
  @Min(0)
  outputPrice?: number;

  // 计价单位；缺省由 kind 决定（service 内按 usage-cost.util.DEFAULT_UNIT_BY_KIND 落库）。
  @IsOptional()
  @IsIn(PRICE_UNITS)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  // 生效时间（ISO 字符串），必填：报表按用量时间取「≤ 生效时间的最新一行」。
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class UpdateModelPriceDto {
  @IsOptional()
  @IsInt()
  modelId?: number;

  @IsOptional()
  @IsIn(PRICE_KINDS)
  kind?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  inputPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outputPrice?: number;

  @IsOptional()
  @IsIn(PRICE_UNITS)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
