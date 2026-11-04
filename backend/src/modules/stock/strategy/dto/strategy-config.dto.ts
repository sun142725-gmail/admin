// 策略配置 DTO（API 契约 §7 管理端组）。校验失败抛 400 → 全局过滤器映射 422
// （http-exception.filter.ts:38-40），e2e 一律 expect(422)。
// 全局管道 whitelist+forbidNonWhitelisted（照 stock-daily-bars.spec.ts:132）会拒绝未声明字段。
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { BacktestCostDto, BacktestPositionModelDto } from '../../backtest/dto/run-backtest.dto';
import { STRATEGY_TEMPLATES } from '../strategy-templates.util';

// 代码半角正则（照 run-backtest.dto.ts:88 范式）：大写/全角一律 422
const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/;

// 正式段起点：严格 YYYY-MM-DD（宽松解析会静默错位，照 toUtcMidnight 半角口径）
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateStrategyDto {
  // 策略名 1-64 必填
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  // 模板四值必填
  @IsIn(STRATEGY_TEMPLATES as unknown as string[])
  template!: string;

  // 模板参数（object；服务层做模板 validateParams 校验，键集=模板参数白名单）
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  // 标的池：≤8 个 ^(sh|sz)\d{6}$（单标的模板恰 1/轮动 ≥2 由服务层校验）
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Matches(SYMBOL_PATTERN, { each: true, message: 'symbols 必须为半角 sh/sz + 6 位数字（如 sh600519）' })
  symbols?: string[];

  // 初始资金（元）>0，默认 100000
  @IsOptional()
  @IsNumber()
  @IsPositive()
  initialCash?: number;

  // 仓位模型（镜像 BacktestPositionModelDto）
  @IsOptional()
  @ValidateNested()
  @Type(() => BacktestPositionModelDto)
  positionModel?: BacktestPositionModelDto;

  // 重放正式段起点 YYYY-MM-DD（服务层 toUtcMidnight 校验真实日期）
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: 'simStartDate 必须为 YYYY-MM-DD 半角格式' })
  simStartDate?: string;

  // 备注 ≤255
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

/** 更新：同 create 全字段可选 + enabled。 */
export class UpdateStrategyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsIn(STRATEGY_TEMPLATES as unknown as string[])
  template?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Matches(SYMBOL_PATTERN, { each: true, message: 'symbols 必须为半角 sh/sz + 6 位数字（如 sh600519）' })
  symbols?: string[];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  initialCash?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BacktestPositionModelDto)
  positionModel?: BacktestPositionModelDto;

  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: 'simStartDate 必须为 YYYY-MM-DD 半角格式' })
  simStartDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** 策略回测入参（API 契约 §7 第 7 条）。limit 取库内末 N 根（BacktestService.loadBars 同语义）。 */
export class StrategyBacktestDto {
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(2000)
  limit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BacktestCostDto)
  cost?: BacktestCostDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BacktestPositionModelDto)
  positionModel?: BacktestPositionModelDto;
}
