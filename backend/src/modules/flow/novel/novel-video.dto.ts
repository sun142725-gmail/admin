// 小说转视频 DTO。
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export class NovelPipelineConfigDto {
  @IsInt()
  @Min(1)
  @Max(6)
  shotsPerChapter!: number;

  @IsInt()
  @Min(3)
  @Max(10)
  videoSeconds!: number;

  @IsString()
  @MaxLength(32)
  imageSize!: string;

  @IsString()
  @MaxLength(32)
  videoSize!: string;
}

export class CreateNovelProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  // 小说原文（粘贴文本或前端读取 txt 后传入）。
  @IsString()
  @MinLength(20)
  @MaxLength(200000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  stylePrompt?: string;

  @IsOptional()
  @IsObject()
  config?: Partial<NovelPipelineConfigDto>;
}

export class UpdateNovelProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  stylePrompt?: string;

  @IsOptional()
  @IsObject()
  config?: Partial<NovelPipelineConfigDto>;
}
