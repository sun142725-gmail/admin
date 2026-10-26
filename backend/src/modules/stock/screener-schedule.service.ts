// 每日收盘选股扫描调度：工作日收盘后对全市场（三大板块市值 Top N）跑金叉扫描并落库。
// 配置（环境变量）：
//   STOCK_SCAN_ENABLED=false 关闭（默认开启；NODE_ENV=test 自动不注册）
//   STOCK_SCAN_CRON       cron 表达式，默认工作日 15:30（A 股 15:00 收盘留出数据结算余量）
//   STOCK_SCAN_BOARDS     板块，默认 main,chinext,star
//   STOCK_SCAN_LIMIT      每板块候选数，默认 500（按市值 Top N）
//   STOCK_SCAN_FREQS      周期，默认 day（多周期耗时线性增加）
//   STOCK_SCAN_STATUS     信号过滤，默认 both（已金叉 + 即将金叉都记录）
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScreenerScanDto } from './dto/screener-scan.dto';
import { ScreenerService } from './screener.service';

@Injectable()
export class ScreenerScheduleService {
  private readonly logger = new Logger(ScreenerScheduleService.name);

  constructor(private readonly screener: ScreenerService) {}

  @Cron(process.env.STOCK_SCAN_CRON ?? '0 30 15 * * 1-5')
  async handleDailyScan() {
    if (!this.enabled()) {
      return;
    }
    try {
      await this.execute();
    } catch (error) {
      // 定时回调异常必须自兜底：否则一次失败会以未处理拒绝打崩进程
      this.logger.error(
        `每日选股扫描执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** 执行一次收盘扫描（定时与手动触发共用）；返回 runId。override 只覆盖显式传入的字段。 */
  async execute(override?: Partial<ScreenerScanDto>, waitForCompletion = true): Promise<number> {
    const dto: ScreenerScanDto = {
      boards: this.boards(),
      limit: Number(process.env.STOCK_SCAN_LIMIT ?? 500),
      freqs: (process.env.STOCK_SCAN_FREQS ?? 'day').split(',').map((s) => s.trim()) as ScreenerScanDto['freqs'],
      indicators: ['kdj', 'macd'],
      mode: 'any',
      status: (process.env.STOCK_SCAN_STATUS as NonNullable<ScreenerScanDto['status']>) ?? 'both',
      withinBars: 3
    };
    if (override?.symbols?.length) {
      dto.boards = undefined;
      dto.pool = undefined;
      dto.symbols = override.symbols;
    } else if (override?.pool) {
      dto.boards = undefined;
      dto.pool = override.pool;
    } else if (override?.boards?.length) {
      dto.boards = override.boards;
    }
    if (override?.limit != null) {
      dto.limit = override.limit;
    }
    if (override?.freqs?.length) {
      dto.freqs = override.freqs;
    }
    if (override?.indicators?.length) {
      dto.indicators = override.indicators;
    }
    if (override?.mode) {
      dto.mode = override.mode;
    }
    if (override?.status) {
      dto.status = override.status;
    }
    if (override?.withinBars != null) {
      dto.withinBars = override.withinBars;
    }
    const poolType = dto.pool ?? (dto.boards?.length ? 'board' : 'manual');
    const runId = await this.screener.startRun(dto, undefined, poolType, this.poolDesc(dto));
    if (waitForCompletion) {
      // 定时路径同步等待执行结果
      await this.screener.executeRunRecord(runId, dto);
    } else {
      // 触发路径后台执行：立即返回 runId 供前端轮询
      void this.screener
        .executeRunRecord(runId, dto)
        .catch((error) =>
          this.logger.error(`触发扫描运行 ${runId} 执行异常: ${error instanceof Error ? error.message : String(error)}`)
        );
    }
    return runId;
  }

  private poolDesc(dto: ScreenerScanDto): string {
    if (dto.pool === 'watchlist') {
      return '我的自选股';
    }
    if (dto.pool === 'roundtable') {
      return '圆桌分析过的股票';
    }
    if (!dto.boards?.length) {
      return '手填代码';
    }
    const labels: Record<string, string> = {
      main: '沪深主板',
      chinext: '创业板',
      star: '科创板'
    };
    return dto.boards.map((board) => labels[board] ?? board).join(' + ');
  }

  private enabled(): boolean {
    if (process.env.NODE_ENV === 'test') {
      return false;
    }
    return process.env.STOCK_SCAN_ENABLED !== 'false';
  }

  private boards(): NonNullable<ScreenerScanDto['boards']> {
    const raw = (process.env.STOCK_SCAN_BOARDS ?? 'main,chinext,star').split(',');
    const valid = ['main', 'chinext', 'star'] as const;
    const parsed = raw
      .map((s) => s.trim())
      .filter((s): s is (typeof valid)[number] => (valid as readonly string[]).includes(s));
    return parsed.length ? parsed : [...valid];
  }

  private boardDesc(boards: NonNullable<ScreenerScanDto['boards']>): string {
    const labels: Record<string, string> = {
      main: '沪深主板',
      chinext: '创业板',
      star: '科创板'
    };
    return boards.map((board) => labels[board] ?? board).join(' + ');
  }
}
