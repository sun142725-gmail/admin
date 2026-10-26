// 自选股 DTO：添加收藏入参。
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
}
