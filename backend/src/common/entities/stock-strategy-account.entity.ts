// 策略模拟盘账户实体（方案 §2④）：1:1 策略（UNIQUE strategy_id），投影重建时整行重写。
// accounts.last_run_* 三列承担最小可观测（方案范围钉死：不做 run 流水表）。
// 不建外键约束（照 stock-daily-bar.entity.ts:8 先例）；全列显式 type（同文件:9-10 坑记录）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_strategy_accounts')
@Index('uk_stock_strategy_accounts_strategy', ['strategyId'], { unique: true })
export class StockStrategyAccount extends BaseEntity {
  // 策略 id（stock_strategy_configs.id，无外键）。
  @Column({ name: 'strategy_id', type: 'int' })
  strategyId!: number;

  // 现金。
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  cash!: number;

  // 净值 = 现金 + Σ持仓市值（日线收盘盯市口径）。
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  equity!: number;

  // 持仓市值合计。
  @Column({ name: 'market_value', type: 'decimal', precision: 14, scale: 2, default: 0 })
  marketValue!: number;

  // 重放截至日（库内最新 bar 日，YYYY-MM-DD；当日 K 线未落库时以库内最新 bar 为界）。
  @Column({ name: 'replayed_through', type: 'varchar', length: 10, nullable: true })
  replayedThrough?: string | null;

  // 最近一次运行时间。
  @Column({ name: 'last_run_date', type: 'datetime', precision: 6, nullable: true })
  lastRunDate?: Date | null;

  // 最近一次运行状态：ok / failed。
  @Column({ name: 'last_run_status', type: 'varchar', length: 16, nullable: true })
  lastRunStatus?: string | null;

  // 最近一次运行错误摘要（≤255；窗口超 MAX_BARS 等失败由本列承载）。
  @Column({ name: 'last_run_error', type: 'varchar', length: 255, nullable: true })
  lastRunError?: string | null;
}
