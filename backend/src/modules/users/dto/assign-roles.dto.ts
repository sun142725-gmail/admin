// 角色分配 DTO 用于校验角色数组。
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class AssignRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  roleIds!: number[];
}
