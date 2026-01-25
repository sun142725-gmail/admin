// 更新字典 DTO 用于修改基础信息。
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDictDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  status?: number;
}
