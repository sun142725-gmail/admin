// 验证码登录 DTO 用于手机号/邮箱验证码登录。
import { IsIn, IsString, Length, MinLength } from 'class-validator';

export class CodeLoginDto {
  @IsIn(['sms', 'email'])
  channel!: 'sms' | 'email';

  @IsString()
  @MinLength(5)
  target!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
