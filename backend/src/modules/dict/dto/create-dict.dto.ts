// 创建字典 DTO 用于字典基础信息校验。
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateDictDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  status?: number;
}
