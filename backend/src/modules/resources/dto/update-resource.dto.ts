// 更新资源 DTO 用于校验菜单修改。
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

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
