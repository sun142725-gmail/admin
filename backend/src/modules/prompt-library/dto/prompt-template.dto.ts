// 提示词库 DTO：创建/更新/查询 + 批量同步/筛选分页。
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested
} from 'class-validator';
import { PROMPT_CATEGORIES } from '../prompt-categories';

// 常用分类 key 单一来源迁至 ../prompt-categories（2026-10 主题分类体系）：
// 5 个流水线基础风格 key + 中文名表；此处 re-export 兼容既有引用。
export { PROMPT_CATEGORIES };

/** category 自由字符串放开（与实体 varchar(64) 容量一致）：trim 后 1..64。 */
const trimCategory = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePromptTemplateDto {
  @ApiProperty({ description: '模板名称', maxLength: 128 })
  @IsString()
  @Length(1, 128)
  name!: string;

  // 2026-10 主题分类体系：category 从 IsIn 五 key 放开为自由字符串——
  // 「按主题组织示例库」（玄幻/星空/修仙等）是一等诉求，sync 轨本就允许自由扩展，
  // 未知分类在 Go categoryHints 兜底落 general（graphic/service.go），行为可预期。
  @ApiProperty({
    description: '风格/主题分类 key（自由字符串，常用值见 PROMPT_CATEGORIES）',
    enum: PROMPT_CATEGORIES
  })
  @Transform(trimCategory)
  @IsString()
  @Length(1, 64)
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
// exampleImageUrl 继承自 Create（@Length(0,500) 对齐实体列容量）：PATCH 传空串 '' 即清空
// （service.update 以 {...dto} spread 直写，typeORM update 写 '' 非 NULL，前端以空串为无图口径）。
export class UpdatePromptTemplateDto extends PartialType(CreatePromptTemplateDto) {}

// 旧 list 轨 QueryPromptTemplateDto（take 裸数组）已随 GET /prompt-templates 一并裁剪：
// 查询统一走 QueryPromptLibraryDto（page/pageSize 分页，见文件末尾）。

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
