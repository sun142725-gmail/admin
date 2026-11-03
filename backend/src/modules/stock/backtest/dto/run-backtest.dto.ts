// 回测运行 DTO（API 契约）：除 symbol 必填外其余字段可选带默认值（默认值在服务层落）。
// 校验失败抛 400 → 全局过滤器映射 422（http-exception.filter.ts:38-40）。
// 防未来函数：无 signals 字段——信号只由服务端 maCrossDemoSignals 生成；
// 全局管道 whitelist+forbidNonWhitelisted（照 stock-daily-bars.spec.ts:132）会直接 422 掉 signals 等未声明字段。
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNegative,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested
} from 'class-validator';

/** 成本参数：与 backtest-cost.util.DEFAULT_COST 对齐的默认值由服务层补。 */
export class BacktestCostDto {
  // 佣金率 ≥0（不设上限：MVP 不做跨字段校验，参数合理性归调用方）
  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionRate?: number;

  // 最低佣金（元）≥0
  @IsOptional()
  @IsNumber()
  @Min(0)
  minCommission?: number;

  // 印花税率 [0, 0.05]（卖出单边）
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.05)
  stampTaxRate?: number;

  // 滑点率 [0, 0.05]
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.05)
  slippageRate?: number;
}

/** 仓位模型参数。 */
export class BacktestPositionModelDto {
  // all-in 全仓 / fixed-ratio 固定比例 / atr 风险预算
  @IsOptional()
  @IsIn(['all-in', 'fixed-ratio', 'atr'])
  type?: 'all-in' | 'fixed-ratio' | 'atr';

  // fixed-ratio 必填，(0,1]
  @ValidateIf((o: BacktestPositionModelDto) => o.type === 'fixed-ratio')
  @IsNumber()
  @IsPositive()
  @Max(1)
  ratio?: number;

  // atr 单股风险预算占比，默认 0.01，(0, 0.1]
  @ValidateIf((o: BacktestPositionModelDto) => o.type === 'atr')
  @IsNumber()
  @IsPositive()
  @Max(0.1)
  riskPct?: number;

  // atr 最大仓位占净值比，默认 1，(0, 1]
  @ValidateIf((o: BacktestPositionModelDto) => o.type === 'atr')
  @IsNumber()
  @IsPositive()
  @Max(1)
  maxPositionPct?: number;

  // ATR 预计算周期（内核预计算用，与仓位模型类型无关），默认 14，[2, 60]
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(60)
  atrPeriod?: number;
}

export class RunBacktestDto {
  // 半角正则（照 quality-detail.dto.ts:7 范式）：大写/全角一律 422
  @IsString()
  @Matches(/^(sh|sz)\d{6}$/, {
    message: 'symbol 必须为半角 sh/sz + 6 位数字（如 sh600519）'
  })
  symbol!: string;

  // 初始资金（元），默认 100000，须 >0
  @IsOptional()
  @IsNumber()
  @IsPositive()
  initialCash?: number;

  // 取库内末 N 根，默认 500，10~2000
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(2000)
  limit?: number;

  // 涨停阈值，默认 0.10，(0, 0.5]。单一阈值声明：不区分板块与历史制度
  // （创业板 2020-08-24 前 10%/后 20%、科创板 20%、ST 5%、北交所 30%），跨期/跨板块回测固定 10% 有系统性偏差。
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(0.5)
  limitUpPct?: number;

  // 跌停阈值，默认 -0.10，[-0.5, 0)
  @IsOptional()
  @IsNumber()
  @Min(-0.5)
  @IsNegative()
  limitDownPct?: number;

  // 档位缺口容差，默认 5e-3，[0, 5e-3]。为什么默认不是 0：交易所涨停价 = round(前收×(1+阈值), 0.01)，
  // 四舍五入使真实涨跌停比率可低于名义阈值（低价档位缺口，实算 3.01→0.099668、2.52→0.099206），
  // 容差过小会系统性漏判低价股一字板 → 可成交性虚高、收益虚高；整数分枚举全扫原始价 [1,100] 元
  // 涨停侧最大缺口 0.004348(@1.15)、跌停侧最大偏差 0.004762(@1.05)，5e-3 覆盖原始价 ≥1 元全部档位并留余量。
  // 参数化责任附注：eps 相对阈值过大时判定带侵占阈值带（如 limitUpPct=0.005 与 eps=5e-3 时判定带为 ≥0，
  // 几乎所有正开盘判涨停），调用方对参数合理性负责，不做跨字段校验。
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.005)
  limitEps?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BacktestCostDto)
  cost?: BacktestCostDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BacktestPositionModelDto)
  positionModel?: BacktestPositionModelDto;
}
