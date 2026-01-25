// 创建字典项 DTO 支持多语言标签。
import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateDictItemDto {
  @IsString()
  value!: string;

  @IsString()
  label!: string;

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
