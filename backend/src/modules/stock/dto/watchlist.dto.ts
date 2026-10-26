// 自选股 DTO：添加/编辑收藏入参。
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class WatchlistAddDto {
  /** 归一化股票代码：sh600519 / sz300750。 */
  @IsString()
  @Matches(/^(sh|sz)\d{6}$/)
  symbol!: string;

  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  group?: string;
}

export class WatchlistUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  group?: string;
}

/** 分页参数（运行历史等列表复用）。 */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

