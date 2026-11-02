// 手动登记发布记录 DTO：manual 通道透传落库，不外呼任何平台。
import { Type } from 'class-transformer';
import { IsISO8601, IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { PUBLISHER_PLATFORMS } from '../publisher.types';

export class CreateRecordDto {
  @IsInt()
  @Type(() => Number)
  projectId!: number;

  @IsIn(PUBLISHER_PLATFORMS)
  platform!: string;

  // 可空：other 平台无账号语义
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  accountId?: number;

  @IsOptional()
  @Length(0, 255)
  title?: string;

  @IsISO8601()
  publishedAt!: string;

  // 后端不做 @IsUrl 严校验防误杀平台短链，URL 由前端 rules 把关
  @IsOptional()
  @Length(0, 500)
  receiptUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
