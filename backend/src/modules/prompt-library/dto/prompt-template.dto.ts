// 提示词库 DTO：创建/更新/查询。
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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

export class UpdatePromptTemplateDto extends CreatePromptTemplateDto {}

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
