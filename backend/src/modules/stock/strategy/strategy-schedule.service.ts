// 模拟盘盘后调度（方案 §4，照 daily-bars-schedule.service.ts:25-59 全套模式：enabled 开关
// + cron 回调自兜底 + 定时与手动共用 execute）。
// 配置（环境变量，.env.example 与 deploy/env.production.example 两处同步注释）：
//   STOCK_STRATEGY_ENABLED=false 关闭（默认开启；NODE_ENV=test 自动不跑）
//   STOCK_STRATEGY_CRON    cron 表达式，默认工作日 16:40——排在日线补抓（16:20）后保证当日 bar 已落库
//   STOCK_STRATEGY_WARMUP_BARS 预热根数，默认 250（与日线库首抓 STOCK_BARS_INIT_BARS=250 对齐）。
//     注意：预热根数应≥在用模板最大回看（ma-cross slowN≤120 / macd 按 long+signal 估≈180 /
//     donchian entryN≤120 / etf-momentum lookbackN≤120）——预热不足时前段指标未成熟无信号、
//     轮动动量分持续 -Infinity，属确定性的静默缩水，运行时不拦截。
//   STOCK_STRATEGY_MAX_BARS    预热+正式总窗口根数上限，默认 2000（超限该策略本轮 failed，
//     禁滑动截断；正式段随时间累积，超限属远期运维项，MVP 不做自动归档）。
// 投影口径（r4）：经济折叠层消费全窗口事件（预热段后果计入影子账户）；信号行落库层按
// trade_date>=sim_start_date 过滤（预热段信号不落库）。落库=事务内「删该策略全部投影→
// 唯一键幂等 upsert」，任意配置变更后投影无残留、同日重跑恒等。
// 单策略失败写 accounts.last_run_status='failed'+error 继续下一策略（错误隔离）。
// 注意服务器时区（cron 按服务器时区解释，照 screener-schedule.service.ts 头注）。
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StrategyService, RunResult } from './strategy.service';

export interface StrategyRunSummary {
  strategyId: number;
  name: string;
  ok: boolean;
  error?: string;
  skipped?: boolean;
  signalsUpserted?: number;
  positionsUpdated?: number;
  replayedThrough?: string | null;
}

@Injectable()
export class StrategyScheduleService {
  private readonly logger = new Logger(StrategyScheduleService.name);

  constructor(private readonly strategy: StrategyService) {}

  @Cron(process.env.STOCK_STRATEGY_CRON ?? '40 16 * * 1-5')
  async handleStrategyReplay(): Promise<void> {
    if (!this.enabled()) {
      return;
    }
    try {
      await this.execute();
    } catch (error) {
      // 定时回调异常必须自兜底：否则一次失败会以未处理拒绝打崩进程
      this.logger.error(`模拟盘重放执行失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 执行一轮模拟盘重放（定时与手动触发共用）；strategyId 指定时只跑该策略（须启用）。 */
  async execute(strategyId?: number): Promise<StrategyRunSummary[]> {
    const configs =
      strategyId != null
        ? [(await this.strategy.getConfig(strategyId)) ?? null].filter(
            (config): config is NonNullable<typeof config> =>
              config != null && config.enabled
          )
        : await this.strategy.listEnabledConfigs();
    const summaries: StrategyRunSummary[] = [];
    // enabled 策略逐个串行（单策略失败错误隔离，继续下一策略）
    for (const config of configs) {
      try {
        const result: RunResult = await this.strategy.runStrategy(config);
        summaries.push({
          strategyId: config.id,
          name: config.name,
          ok: true,
          skipped: result.skipped,
          signalsUpserted: result.signalsUpserted,
          positionsUpdated: result.positionsUpdated,
          replayedThrough: result.replayedThrough
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`策略 ${config.id}(${config.name}) 模拟盘重放失败: ${message}`);
        await this.strategy.markRunFailed(config.id, message).catch(() => undefined);
        summaries.push({ strategyId: config.id, name: config.name, ok: false, error: message });
      }
    }
    return summaries;
  }

  private enabled(): boolean {
    if (process.env.NODE_ENV === 'test') {
      return false;
    }
    return process.env.STOCK_STRATEGY_ENABLED !== 'false';
  }
}
