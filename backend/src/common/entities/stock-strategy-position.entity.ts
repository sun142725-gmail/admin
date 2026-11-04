// 策略持仓投影实体（方案 §2③）：每 (strategy_id, symbol) 一行，状态机折叠产出。
// 幂等键 UNIQUE(strategy_id, symbol)——换池移出 symbol 的旧行随「删全部投影+插新」一并清除（§4）。
// 不建外键约束（照 stock-daily-bar.entity.ts:8 先例）；全列显式 type（同文件:9-10 坑记录）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_strategy_positions')
@Index('uk_stock_strategy_positions_idem', ['strategyId', 'symbol'], { unique: true })
export class StockStrategyPosition extends BaseEntity {
  // 策略 id（stock_strategy_configs.id，无外键）。
  @Column({ name: 'strategy_id', type: 'int' })
  strategyId!: number;

  // 归一化代码。
  @Column({ type: 'varchar', length: 16 })
  symbol!: string;

  // 状态机终态：flat / pending_open / holding / pending_close（mark/reset 后仅 flat/holding 可达）。
  @Column({ type: 'varchar', length: 16, default: 'flat' })
  status!: string;

  // 持股数（flat 恒 0）。
  @Column({ type: 'int', default: 0 })
  shares!: number;

  // 含费含滑点买入成本均价（flat 为 null）。
  @Column({ name: 'avg_cost', type: 'decimal', precision: 12, scale: 3, nullable: true })
  avgCost?: number | null;

  // 最近一次买入成交日（UTC 零点；历史事实，清仓不清除——可早于 sim_start_date，影子账户口径）。
  @Column({ name: 'last_buy_date', type: 'datetime', precision: 6, nullable: true })
  lastBuyDate?: Date | null;

  // 最近盯市日（UTC 零点）。
  @Column({ name: 'last_mark_date', type: 'datetime', precision: 6, nullable: true })
  lastMarkDate?: Date | null;

  // 盯市价（该 symbol 最近一根 bar 收盘，含 volume=0 停牌占位行）。
  @Column({ name: 'last_price', type: 'decimal', precision: 12, scale: 3, nullable: true })
  lastPrice?: number | null;

  // 持仓市值（shares×last_price；flat 恒 0）。
  @Column({ name: 'market_value', type: 'decimal', precision: 14, scale: 2, nullable: true })
  marketValue?: number | null;

  // 浮动盈亏（市值−shares×avg_cost；flat 恒 null）。
  @Column({ name: 'unrealized_pnl', type: 'decimal', precision: 14, scale: 2, nullable: true })
  unrealizedPnl?: number | null;
}
