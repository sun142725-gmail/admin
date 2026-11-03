// 回测薄服务（方案 §2.7）：读库 → Number() 强转映射 → 内置演示信号 → 撮合内核 → 结果+config 回显。
// 校验失败抛 BadRequestException（经全局过滤器映射 422，http-exception.filter.ts:38-40）。
// 无新表：回测不落任何运行记录（照 daily-bars.controller.ts:50「无 run 表不返回 runId」先例）。
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockDailyBar } from '../../../common/entities/stock-daily-bar.entity';
import { isoDay } from '../daily-bars/daily-bars-calib.util';
import { maCrossDemoSignals } from './backtest-demo-signal.util';
import { DEFAULT_CONFIG, runBacktest } from './backtest-match.util';
import { atrModel, allInModel, fixedRatioModel, PositionModel } from './backtest-sizing.util';
import { BacktestConfig, EquityPoint, TradeRecord, BacktestMetrics } from './backtest.types';
import { BacktestPositionModelDto, RunBacktestDto } from './dto/run-backtest.dto';

/** 内核最小可回测 bar 数（<2 无法构成任何 T→T+1 成交路径）。 */
const MIN_BARS = 2;

@Injectable()
export class BacktestService {
  constructor(
    @InjectRepository(StockDailyBar)
    private readonly barRepo: Repository<StockDailyBar>
  ) {}

  async run(dto: RunBacktestDto): Promise<{
    symbol: string;
    barsCount: number;
    firstDate: string | null;
    lastDate: string | null;
    equityCurve: EquityPoint[];
    trades: TradeRecord[];
    metrics: BacktestMetrics;
    config: BacktestConfig;
  }> {
    const bars = await this.loadBars(dto.symbol, dto.limit ?? DEFAULT_LIMIT);
    if (bars.length < MIN_BARS) {
      throw new BadRequestException(`库内可用日 K 不足（${bars.length} 根），回测至少需要 ${MIN_BARS} 根`);
    }

    const config: BacktestConfig = {
      initialCash: dto.initialCash ?? DEFAULT_CONFIG.initialCash,
      limitUpPct: dto.limitUpPct ?? DEFAULT_CONFIG.limitUpPct,
      limitDownPct: dto.limitDownPct ?? DEFAULT_CONFIG.limitDownPct,
      limitEps: dto.limitEps ?? DEFAULT_CONFIG.limitEps,
      cost: {
        commissionRate: dto.cost?.commissionRate ?? DEFAULT_CONFIG.cost.commissionRate,
        minCommission: dto.cost?.minCommission ?? DEFAULT_CONFIG.cost.minCommission,
        stampTaxRate: dto.cost?.stampTaxRate ?? DEFAULT_CONFIG.cost.stampTaxRate,
        slippageRate: dto.cost?.slippageRate ?? DEFAULT_CONFIG.cost.slippageRate
      }
    };
    const positionModel = resolvePositionModel(dto.positionModel);
    const atrPeriod = dto.positionModel?.atrPeriod ?? DEFAULT_ATR_PERIOD;

    // 防未来函数：信号只由服务端内置演示信号生成（HTTP 不接受外部信号数组）。
    const signals = maCrossDemoSignals(bars);
    const result = runBacktest({ bars, signals, config, positionModel, atrPeriod });

    return {
      symbol: dto.symbol,
      barsCount: bars.length,
      firstDate: bars[0]?.date ?? null,
      lastDate: bars[bars.length - 1]?.date ?? null,
      equityCurve: result.equityCurve,
      trades: result.trades,
      metrics: result.metrics,
      config: result.config
    };
  }

  /** 读库取末 N 根并映射为内核 Bar（decimal 列返回 string，Number() 强转照 daily-bars.service.ts:517-526 先例）。 */
  private async loadBars(symbol: string, limit: number) {
    const rows = await this.barRepo.find({
      where: { symbol },
      order: { tradeDate: 'ASC' }
    });
    const sliced = rows.slice(Math.max(0, rows.length - limit));
    return sliced.map((row) => ({
      date: isoDay(row.tradeDate),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      amount: Number(row.amount)
    }));
  }
}

const DEFAULT_LIMIT = 500;
const DEFAULT_ATR_PERIOD = 14;

/** 请求仓位参数 → 内置仓位插件（缺省 all-in）。 */
const resolvePositionModel = (pm: BacktestPositionModelDto | undefined): PositionModel => {
  if (pm?.type === 'fixed-ratio') {
    return fixedRatioModel(pm.ratio as number); // ratio 必填性由 DTO @ValidateIf 校验保证
  }
  if (pm?.type === 'atr') {
    return atrModel({
      riskPct: pm.riskPct ?? 0.01,
      maxPositionPct: pm.maxPositionPct ?? 1
    });
  }
  return allInModel();
};
