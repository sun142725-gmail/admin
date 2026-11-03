// 盘后日线行情补抓调度（照 screener-schedule.service.ts 全套模式：enabled 开关 + cron 回调自兜底
// + 定时与手动共用 execute）。
// 配置（环境变量，.env.example 与 deploy/env.production.example 两处同步注释）：
//   STOCK_BARS_ENABLED=false 关闭（默认开启；NODE_ENV=test 自动不跑）
//   STOCK_BARS_CRON        cron 表达式，默认工作日 16:20（A 股收盘后与选股扫描 15:30 错峰；注意服务器时区）
//   STOCK_BARS_INTERVAL_MS 串行逐标的间隔毫秒（上游限流），默认 300
//   STOCK_BARS_MAX_PER_RUN 单轮最多处理标的数，默认 200（余量下轮续跑）
//   STOCK_BARS_INIT_BARS   首抓/扩窗根数，默认 250
//   STOCK_BARS_POOL_DAYS   候选池命中回看天数，默认 7
// 运行时补缺口径：每标的每轮按「最新落库日」+「最早中段缺口锚点」双锚扩拉取窗口，
// 窗口内全部行幂等 upsert。补缺三归宿：①窗口内尾部/中段缺口自动回填；②上游确实无数
// （停牌/假休市）由质量探针报表标注；③窗口外缺口（早于 today−maxBars 日历天）报表标注
// 「超出自动补抓窗口，需手动 full 重抓」。
// OnApplicationBootstrap 启动补缺：断点续抓语义天然补停机缺日（幂等，重入无害）。
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DailyBarsService, BackfillRunSummary } from './daily-bars.service';

@Injectable()
export class DailyBarsScheduleService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyBarsScheduleService.name);

  constructor(private readonly bars: DailyBarsService) {}

  @Cron(process.env.STOCK_BARS_CRON ?? '20 16 * * 1-5')
  async handleDailyBackfill(): Promise<void> {
    if (!this.enabled()) {
      return;
    }
    try {
      await this.execute();
    } catch (error) {
      // 定时回调异常必须自兜底：否则一次失败会以未处理拒绝打崩进程
      this.logger.error(`每日日线补抓执行失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 执行一轮补抓（定时与手动触发共用）。 */
  async execute(symbols?: string[], full = false): Promise<BackfillRunSummary> {
    return this.bars.backfillUniverse(symbols, { full });
  }

  // 启动补缺：后台跑一轮（void 不阻塞启动），抓取失败/降级由服务层计数日志，进程内运行锁防重入
  onApplicationBootstrap(): void {
    if (!this.enabled()) {
      return;
    }
    void this.bars.backfillUniverse().catch((error) =>
      this.logger.error(`启动补缺执行异常: ${error instanceof Error ? error.message : String(error)}`)
    );
  }

  private enabled(): boolean {
    if (process.env.NODE_ENV === 'test') {
      return false;
    }
    return process.env.STOCK_BARS_ENABLED !== 'false';
  }
}
