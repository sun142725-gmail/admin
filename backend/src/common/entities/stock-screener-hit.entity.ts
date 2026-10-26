// 选股扫描命中记录：一次运行中命中的股票（每 run×symbol×freq 一行，双指标信号合并）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_screener_hits')
@Index(['runId'])
@Index(['symbol'])
@Index(['runId', 'symbol', 'freq'], { unique: true })
export class StockScreenerHit extends BaseEntity {
  @Column({ name: 'run_id', type: 'int' })
  runId!: number;

  @Column({ length: 16 })
  symbol!: string;

  @Column({ length: 64, default: '' })
  name!: string;

  // day / week / month。
  @Column({ length: 8 })
  freq!: string;

  @Column({ name: 'last_close', type: 'decimal', precision: 12, scale: 3, nullable: true })
  lastClose!: number | null;

  @Column({ name: 'pct_1d', type: 'decimal', precision: 8, scale: 2, nullable: true })
  pct1d!: number | null;

  // 本行最佳信号：golden（已金叉）优先于 upcoming（即将金叉）。
  @Column({ name: 'signal_type', length: 16 })
  signalType!: string;

  // 信号来源：kdj / macd / both（两指标同级别命中）。
  @Column({ name: 'signal_source', length: 8 })
  signalSource!: string;

  // 已金叉的回看根数（golden 时有效，取两指标中最近的）。
  @Column({ name: 'bars_ago', type: 'int', nullable: true })
  barsAgo!: number | null;

  // 双指标完整信号快照 JSON，供详情展示。
  @Column({ name: 'signals_json', type: 'text', nullable: true })
  signalsJson!: string | null;
}
