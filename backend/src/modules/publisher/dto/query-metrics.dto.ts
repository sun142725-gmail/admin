// 查询平台数据回流明细 DTO：作品/平台/日期区间（YYYY-MM-DD）筛选。
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches } from 'class-validator';
import { PUBLISHER_PLATFORMS } from '../publisher.types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class QueryMetricsDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  projectId?: number;

  @IsOptional()
  @IsIn(PUBLISHER_PLATFORMS as unknown as string[])
  platform?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from 必须为 YYYY-MM-DD 格式' })
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to 必须为 YYYY-MM-DD 格式' })
  to?: string;
}
