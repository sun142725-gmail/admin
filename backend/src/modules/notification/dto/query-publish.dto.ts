// 查询发布记录 DTO 用于列表筛选。
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { NOTIFICATION_CHANNEL_TYPES, NOTIFICATION_PUBLISH_STATUS } from '../notification.types';

export class QueryPublishDto {
  @IsOptional()
  @IsIn(NOTIFICATION_CHANNEL_TYPES)
  channelType?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_PUBLISH_STATUS)
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  templateId?: number;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  pageSize?: number;
}
