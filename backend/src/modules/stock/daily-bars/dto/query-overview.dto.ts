// 数据质量概览查询 DTO：池筛选 + 分页。
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryOverviewDto {
  // all=自选∪候选池（默认）/ watchlist=仅自选 / screener=仅候选池命中
  @IsOptional()
  @IsIn(['all', 'watchlist', 'screener'])
  pool?: 'all' | 'watchlist' | 'screener';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;
}
