// 加入家庭 DTO 校验 6 位邀请码。
import { IsString, Matches } from 'class-validator';

export class JoinFamilyDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{6}$/)
  code!: string;
}
