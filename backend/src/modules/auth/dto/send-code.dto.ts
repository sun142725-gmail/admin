// 验证码发送 DTO 用于短信/邮件验证码下发。
import { IsIn, IsString, MinLength } from 'class-validator';

export class SendCodeDto {
  @IsIn(['sms', 'email'])
  channel!: 'sms' | 'email';

  @IsIn(['login', 'register', 'reset_password'])
  scene!: 'login' | 'register' | 'reset_password';

  @IsString()
  @MinLength(5)
  target!: string;
}
