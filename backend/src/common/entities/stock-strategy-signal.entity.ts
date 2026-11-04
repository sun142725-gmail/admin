// 策略信号投影实体（方案 §2②）：重放式投影的信号行落库层。
// 幂等键 UNIQUE(strategy_id, trade_date, symbol, action)——并发重复重放兜底（§4 幂等三层②）。
// 不建外键约束（照 stock-daily-bar.entity.ts:8 先例）；全列显式 type（同文件:9-10 坑记录）。
// trade_date 统一存 UTC 零点（daily-bars-calib.util.ts toUtcMidnight/isoDay 读写）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_strategy_signals')
@Index('idx_stock_strategy_signals_strategy_date', ['strategyId', 'tradeDate'])
@Index('uk_stock_strategy_signals_idem', ['strategyId', 'tradeDate', 'symbol', 'action'], { unique: true })
export class StockStrategySignal extends BaseEntity {
  // 策略 id（stock_strategy_configs.id，无外键）。
  @Column({ name: 'strategy_id', type: 'int' })
  strategyId!: number;

  // 信号产生日 T（UTC 零点；成交固定 T+1 开盘，内核同语义）。
  @Column({ name: 'trade_date', type: 'datetime', precision: 6 })
  tradeDate!: Date;

  // 归一化代码 sh600519/sz300750。
  @Column({ type: 'varchar', length: 16 })
  symbol!: string;

  // 信号方向：buy/sell。
  @Column({ type: 'varchar', length: 8 })
  action!: string;

  // 终态：emitted（撮合事件缺失的防御态）/ filled / skipped。
  @Column({ type: 'varchar', length: 16, default: 'emitted' })
  status!: string;

  // skipped 的放弃原因：内核 SkipReason 同码集 + 组合层扩展码 no_bar（信号日该标的整行缺 bar）。
  @Column({ name: 'skip_reason', type: 'varchar', length: 32, nullable: true })
  skipReason?: string | null;

  // 滑点后成交价（filled 才有值）。
  @Column({ name: 'filled_price', type: 'decimal', precision: 12, scale: 3, nullable: true })
  filledPrice?: number | null;

  // 成交股数（filled ≥100 且整手；skipped 恒 0）。
  @Column({ type: 'int', default: 0 })
  shares!: number;

  // 全部费用（filled 才有值）。
  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
  fee?: number | null;
}
