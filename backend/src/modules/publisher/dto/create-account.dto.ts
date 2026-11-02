// 创建平台账号 DTO：credentials 仅加密落库，永不回传。
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PUBLISHER_PLATFORMS } from '../publisher.types';

export class CreateAccountDto {
  @IsIn(PUBLISHER_PLATFORMS)
  platform!: string;

  @Length(1, 128)
  accountName!: string;

  // 可空：无凭据账号（如人工代发）允许创建；传值则 AES-256-GCM 加密落库
  @IsOptional()
  @IsString()
  credentials?: string;

  @IsOptional()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @Length(0, 255)
  remark?: string;
}
