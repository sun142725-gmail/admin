// 分配权限 DTO 用于校验权限数组。
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class AssignPermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  permissionIds!: number[];
}
