// 创建家庭 DTO 校验家庭名称与内置头像标识。
import { IsString, Length } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @Length(2, 20)
  name!: string;

  @IsString()
  @Length(1, 64)
  avatar!: string;
}
