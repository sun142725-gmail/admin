// 验证码重置密码 DTO 用于手机号/邮箱找回密码。
import { IsIn, IsString, Length, MinLength } from 'class-validator';

export class CodeResetPasswordDto {
  @IsIn(['sms', 'email'])
  channel!: 'sms' | 'email';

  @IsString()
  @MinLength(5)
  target!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
