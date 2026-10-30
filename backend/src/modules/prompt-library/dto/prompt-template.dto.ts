// 提示词库 DTO：创建/更新/查询 + 批量同步/筛选分页。
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

// 与图文流水线约定的风格 key，扩展新流水线时在此补充。
export const PROMPT_CATEGORIES = ['illustrated', 'poster', 'anime', 'ui', 'general'] as const;

export class CreatePromptTemplateDto {
  @ApiProperty({ description: '模板名称', maxLength: 128 })
  @IsString()
  @Length(1, 128)
  name!: string;

  @ApiProperty({ description: '风格分类 key', enum: PROMPT_CATEGORIES })
  @IsIn(PROMPT_CATEGORIES as unknown as string[])
  category!: string;

  @ApiPropertyOptional({ description: '风格标签，逗号分隔' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  styleTags?: string;

  @ApiProperty({ description: 'prompt 模板正文，支持 {{变量}} 占位' })
  @IsString()
  @Length(1, 8000)
  template!: string;

  @ApiPropertyOptional({ description: '反向提示词' })
  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @ApiPropertyOptional({ description: '示例效果图 URL' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  exampleImageUrl?: string;

  @ApiPropertyOptional({ description: '来源说明' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  source?: string;

  @ApiPropertyOptional({ description: '推荐模型 id' })
  @IsOptional()
  @IsInt()
  modelId?: number;
}

// PATCH 语义：所有字段可选（曾误用全必填继承导致 PATCH 只传 name 报 422）。
export class UpdatePromptTemplateDto extends PartialType(CreatePromptTemplateDto) {}

export class QueryPromptTemplateDto {
  @ApiPropertyOptional({ description: '按风格分类过滤' })
  @IsOptional()
  @IsIn(PROMPT_CATEGORIES as unknown as string[])
  category?: string;

  @ApiPropertyOptional({ description: '按名称/标签模糊搜索' })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  keyword?: string;

  @ApiPropertyOptional({ description: '条数，默认 50' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

// ---------- 批量同步（幂等导入）：按 sha256(trim(prompt)) 去重 ----------

export class SyncPromptTemplateItemDto {
  @ApiProperty({ description: '提示词正文（幂等键为其 sha256）' })
  @IsString()
  @Length(1, 20000)
  prompt!: string;

  // 采集来源分类自由扩展，不限于 PROMPT_CATEGORIES。
  @ApiPropertyOptional({ description: '分类（缺省 general）' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  category?: string;

  @ApiPropertyOptional({ description: '标题（缺省取 prompt 前 20 字）' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  title?: string;

  @ApiPropertyOptional({ description: '来源工具（如 midjourney/novelai）' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceTool?: string;

  @ApiPropertyOptional({ description: '来源模型名' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceModel?: string;

  @ApiPropertyOptional({ description: '示例图 URL，http(s) 时 best-effort 下载落本地' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  imageUrl?: string;

  @ApiPropertyOptional({ description: '来源页面链接' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  sourceUrl?: string;
}

export class SyncPromptTemplatesDto {
  @ApiProperty({ type: [SyncPromptTemplateItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SyncPromptTemplateItemDto)
  items!: SyncPromptTemplateItemDto[];
}

export class QueryPromptLibraryDto {
  @ApiPropertyOptional({ description: '按分类过滤' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  category?: string;

  @ApiPropertyOptional({ description: '按来源工具过滤' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceTool?: string;

  @ApiPropertyOptional({ description: '按名称/正文模糊搜索' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  keyword?: string;

  @ApiPropertyOptional({ description: '页码，默认 1' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数，默认 20，上限 100' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
