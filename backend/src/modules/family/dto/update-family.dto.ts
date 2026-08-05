// 更新家庭 DTO 校验可选的家庭名称与头像。
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateFamilyDto {
  @IsOptional()
  @IsString()
  @Length(2, 20)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  avatar?: string;
}
