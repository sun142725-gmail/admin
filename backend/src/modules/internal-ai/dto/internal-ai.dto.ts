// 内部 AI 接口 DTO：Go 引擎回调 Node 时的请求结构（与 node-handlers 的依赖面一致）。
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

export class InternalChatMessageDto {
  @ApiProperty({ enum: ['system', 'user', 'assistant'] })
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @ApiProperty({ description: '消息内容' })
  @IsString()
  @Length(1, 32000)
  content!: string;
}

export class InternalChatDto {
  @ApiProperty({ description: '发起用户 id（用量记录归属）' })
  @IsInt()
  userId!: number;

  @ApiProperty({ type: [InternalChatMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalChatMessageDto)
  messages!: InternalChatMessageDto[];

  @ApiPropertyOptional({ description: '温度，默认 0.7' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: '指定模型 id（空则按 chat 能力路由）' })
  @IsOptional()
  @IsInt()
  modelId?: number;
}

export class InternalImageDto {
  @ApiProperty({ description: '发起用户 id（用量记录归属）' })
  @IsInt()
  userId!: number;

  @ApiProperty({ description: '生图 prompt' })
  @IsString()
  @Length(1, 8000)
  prompt!: string;

  @ApiPropertyOptional({ description: '尺寸，如 1024x1024' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+x\d+$/, { message: 'size 格式须为 宽x高（如 1024x1024）' })
  size?: string;

  @ApiPropertyOptional({ description: '张数，默认 1' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  count?: number;

  @ApiPropertyOptional({ description: '指定模型 id（空则按 image 能力路由）' })
  @IsOptional()
  @IsInt()
  modelId?: number;

  @ApiPropertyOptional({
    description: '图生图参考图（data URL，最多 4 张；首帧延续/角色一致性用）',
    // 单张长度不设上限：大参考图（多 MB base64）是合法输入，由 main.ts 的 10MB JSON body 上限兜底，
    // DTO 层再卡会误伤大参考图场景。
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  referenceImages?: string[];
}

export class InternalTtsDto {
  @ApiProperty({ description: '发起用户 id（用量记录归属）' })
  @IsInt()
  userId!: number;

  @ApiProperty({ description: '要合成的文本（一般为分幕内容）' })
  @IsString()
  @Length(1, 2000)
  text!: string;

  @ApiPropertyOptional({ description: '音色（默认 alloy）' })
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiPropertyOptional({ description: '语速 0.25-4，默认 1' })
  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(4)
  speed?: number;

  @ApiPropertyOptional({ description: '指定模型 id（空则按 tts 能力路由）' })
  @IsOptional()
  @IsInt()
  modelId?: number;
}
