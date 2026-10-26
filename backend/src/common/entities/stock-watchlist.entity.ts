// 自选股实体：用户收藏的股票清单。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_watchlist')
@Index(['userId'])
@Index(['userId', 'symbol'], { unique: true })
export class StockWatchlist extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  // 归一化代码：sh600519 / sz300750。
  @Column({ length: 16 })
  symbol!: string;

  // 股票名称冗余存储：展示时无需再调行情接口；名称变更罕见，重新收藏即可更新。
  @Column({ length: 64 })
  name!: string;

  // 用户的备注（为什么关注它），可空。
  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  // 自由分组标签（默认「默认」），前端按组筛选展示。
  @Column({ type: 'varchar', length: 32, default: '默认' })
  group!: string;
}
