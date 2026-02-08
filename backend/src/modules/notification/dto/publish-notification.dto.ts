// 发布通知 DTO 用于校验发送请求。
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { NOTIFICATION_CHANNEL_TYPES } from '../notification.types';

export class PublishNotificationDto {
  @IsInt()
  @Type(() => Number)
  @Min(1)
  templateId!: number;

  @IsIn(NOTIFICATION_CHANNEL_TYPES)
  channelType!: string;

  @IsArray()
  recipients!: Array<string | number>;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
