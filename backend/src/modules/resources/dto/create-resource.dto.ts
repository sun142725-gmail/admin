// 创建资源 DTO 用于校验菜单信息。
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsString()
  permissionCode?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
