// 更新成员 DTO 校验家庭内昵称。
import { IsString, Length } from 'class-validator';

export class UpdateMemberDto {
  @IsString()
  @Length(1, 20)
  nickname!: string;
}
