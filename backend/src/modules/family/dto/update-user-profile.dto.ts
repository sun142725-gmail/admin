// 更新用户资料 DTO 校验移动端昵称与头像。
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarUrl?: string;
}
