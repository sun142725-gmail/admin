// 重置密码 DTO 用于校验新密码。
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  password!: string;
}
