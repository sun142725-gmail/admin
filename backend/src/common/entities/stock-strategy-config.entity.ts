// 策略配置实体（方案 §2①）：策略是管理端全局对象（无 userId 维度），模拟盘=其影子账户。
// 不建外键约束（照 stock-daily-bar.entity.ts:8 先例，避免 sqlite/mysql 迁移差异）。
// 数值/日期/布尔列全部显式 type：联合类型实体列不显式 type 时 TypeORM 反射为 Object，
// sqlite 建表直接失败（照 stock-daily-bar.entity.ts:9-10 实物坑记录）。
// json 列无字面量 default（character-card.entity.ts:20-24 先例；字面量 default 在 MySQL 8.0.13 前受限），
// 读取侧 ?? 归一。created_by 对操作者，可空。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('stock_strategy_configs')
@Index('uk_stock_strategy_configs_name', ['name'], { unique: true })
export class StockStrategyConfig extends BaseEntity {
  // 策略名（唯一，1-64 字符）。
  @Column({ type: 'varchar', length: 64 })
  name!: string;

  // 模板标识：ma-cross/macd/donchian/etf-momentum（strategy.types.ts 白名单）。
  @Column({ type: 'varchar', length: 32 })
  template!: string;

  // 模板参数（键集=模板参数白名单；读取侧与模板 defaultParams 合并），无默认值。
  @Column({ type: 'json', nullable: true })
  params?: Record<string, unknown> | null;

  // 标的池（≤8 个 ^(sh|sz)\d{6}$；单标的模板长度恒 1、轮动 ≥2），无默认值。
  @Column({ type: 'json', nullable: true })
  symbols?: string[] | null;

  // 初始资金（元）。
  @Column({ name: 'initial_cash', type: 'decimal', precision: 14, scale: 2, default: 100000 })
  initialCash!: number;

  // 仓位模型参数（镜像 BacktestPositionModelDto；null=模板默认），无默认值。
  @Column({ name: 'position_model', type: 'json', nullable: true })
  positionModel?: Record<string, unknown> | null;

  // 启用开关（停用不参与调度重放；点评停用策略的回测绩效合法）。
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  // 重放正式段起点（YYYY-MM-DD；允许修改——投影每轮全量重建无残留）。
  @Column({ name: 'sim_start_date', type: 'varchar', length: 10 })
  simStartDate!: string;

  // 备注。
  @Column({ type: 'varchar', length: 255, nullable: true })
  remark?: string | null;

  // 创建者用户 id（可空：系统初始化场景）。
  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy?: number | null;
}
