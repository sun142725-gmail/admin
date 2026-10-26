// 选股扫描运行记录：一次定时/手动触发扫描的汇总。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_screener_runs')
@Index(['runDate'])
export class StockScreenerRun extends BaseEntity {
  // 运行日期（YYYY-MM-DD，交易日收盘扫描的天然主键维度）。
  @Column({ name: 'run_date', type: 'varchar', length: 10 })
  runDate!: string;

  // 候选池类型：board（板块）/ watchlist（自选）/ roundtable（圆桌历史）/ manual（手填）。
  @Column({ name: 'pool_type', length: 16 })
  poolType!: string;

  // 候选池描述（如「沪深主板 + 创业板 + 科创板」）。
  @Column({ name: 'pool_desc', type: 'varchar', length: 128 })
  poolDesc!: string;

  // 扫描配置快照 JSON：{ boards?, limit?, pool?, freqs, indicators, mode, status, withinBars }。
  @Column({ type: 'text' })
  config!: string;

  @Column({ name: 'pool_size', type: 'int', default: 0 })
  poolSize!: number;

  @Column({ type: 'int', default: 0 })
  scanned!: number;

  @Column({ type: 'int', default: 0 })
  failed!: number;

  @Column({ type: 'int', default: 0 })
  matched!: number;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs!: number;

  // running / completed / failed。
  @Column({ length: 16, default: 'running' })
  status!: string;

  @Column({ name: 'error_message', type: 'varchar', length: 255, nullable: true })
  errorMessage?: string | null;
}
