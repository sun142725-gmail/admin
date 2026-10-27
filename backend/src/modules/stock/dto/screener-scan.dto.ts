// 股票选股 DTO：金叉扫描入参（板块选池或手填代码二选一）。
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ScreenerScanDto {
  /** 手填候选代码（支持 600519 / sh600519 / 600519.SH 混排），上限 50；与 boards 二选一。 */
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  @ArrayUnique()
  symbols?: string[];

  /** 板块选池：main 沪深主板 / chinext 创业板 / star 科创板，可多选；与 symbols/pool 二选一。 */
  @IsOptional()
  @IsIn(['main', 'chinext', 'star'], { each: true })
  boards?: Array<'main' | 'chinext' | 'star'>;

  /** 个人/市场候选池：watchlist=我的自选股；roundtable=圆桌分析过的个股；amount=全市场成交额排行 Top limit。与 boards/symbols 三选一。 */
  @IsOptional()
  @IsIn(['watchlist', 'roundtable', 'amount'])
  pool?: 'watchlist' | 'roundtable' | 'amount';

  /** 板块候选数量：按总市值从大到小取前 N 只，1-500，默认 100。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;

  /** 扫描周期：日线/周线/月线，可多选；缺省或含 any 时扫全部三周期。 */
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'any'], { each: true })
  freqs?: Array<'day' | 'week' | 'month' | 'any'>;

  /** 参与判定的指标：KDJ / MACD，可多选，缺省两者。 */
  @IsOptional()
  @IsIn(['kdj', 'macd'], { each: true })
  indicators?: Array<'kdj' | 'macd'>;

  /** any=任一指标命中即入选；all=所选指标须同时命中。 */
  @IsOptional()
  @IsIn(['any', 'all'])
  mode?: 'any' | 'all';

  /** golden=已金叉；upcoming=即将金叉；both=两者都要。 */
  @IsOptional()
  @IsIn(['golden', 'upcoming', 'both'])
  status?: 'golden' | 'upcoming' | 'both';

  /** 已金叉的回看窗口（bar 数），1-10，默认 3。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  withinBars?: number;
}
