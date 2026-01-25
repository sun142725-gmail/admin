// 创建权限 DTO 用于校验权限码。
import { IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
