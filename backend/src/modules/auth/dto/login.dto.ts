// 登录请求 DTO 用于校验账号与密码。
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  account?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
