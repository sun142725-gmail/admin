// 更新字典项 DTO 支持多语言标签。
import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDictItemDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsObject()
  labelI18n?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  status?: number;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}
