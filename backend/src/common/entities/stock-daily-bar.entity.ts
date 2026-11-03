// 股票日线行情库：单标的按日一根，唯一键 (symbol, trade_date) 幂等 upsert（增量续抓/全量重抓共用）。
// 复权口径（必须与 daily-bars.service.ts 源门禁一致）：
//   OHLC 四列存前复权价（qfq，与行情软件同口径）——上游仅东财主源满足完整口径
//   （东财 fqt=1 前复权且成交额真实）；腾讯 qfqday 前复权但 amount 恒 0；新浪公开接口不复权且 amount 恒 0，
//   降级命中腾讯/新浪时由服务层门禁拦截不写库（新浪不复权会以错误价覆盖前复权序列，
//   双源 amount=0 会把真实成交额清零——降级是暂态而错误口径写入是持久伤害）。
//   volume(手)/amount(元) 为原始口径不复权。
// 不建外键约束（照 video-platform-metric.entity.ts 先例，避免 sqlite/mysql 迁移差异）。
// 数值列全部显式 type：联合类型实体列不显式 type 时 TypeORM 反射为 Object，sqlite 建表直接失败
// （照 video-platform-metric.entity.ts:28 注释的实物坑记录）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_daily_bars')
@Index('uk_stock_daily_bars_symbol_date', ['symbol', 'tradeDate'], { unique: true })
export class StockDailyBar extends BaseEntity {
  // 归一化代码：sh600519 / sz300750（与 stock-watchlist.entity.ts 同款）。
  @Column({ type: 'varchar', length: 16 })
  symbol!: string;

  // 交易日，统一存 UTC 零点（照 video-platform-metric.entity.ts metric_date 先例）。
  @Column({ name: 'trade_date', type: 'datetime', precision: 6 })
  tradeDate!: Date;

  // 前复权开盘价。
  @Column({ type: 'decimal', precision: 12, scale: 3 })
  open!: number;

  // 前复权最高价。
  @Column({ type: 'decimal', precision: 12, scale: 3 })
  high!: number;

  // 前复权最低价。
  @Column({ type: 'decimal', precision: 12, scale: 3 })
  low!: number;

  // 前复权收盘价（与 stock-screener-hit lastClose 同 precision/scale）。
  @Column({ type: 'decimal', precision: 12, scale: 3 })
  close!: number;

  // 成交量（手），原始口径；0=停牌占位，由质量探针 zero_volume 标记。
  @Column({ type: 'int', default: 0 })
  volume!: number;

  // 成交额（元），原始口径（全市场日额约 2e12，decimal(16,2) 足够）。
  @Column({ type: 'decimal', precision: 16, scale: 2, default: 0 })
  amount!: number;
}
