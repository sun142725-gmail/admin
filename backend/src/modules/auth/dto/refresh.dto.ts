// 刷新令牌 DTO 用于校验 refreshToken。
import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
