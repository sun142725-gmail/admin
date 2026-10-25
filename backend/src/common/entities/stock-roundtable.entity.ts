// 股市圆桌会话：一次多专家分析会议的主记录。
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { StockRoundtableTurn } from './stock-roundtable-turn.entity';

@Index(['userId'])
@Index(['createdAt'])
@Entity('stock_roundtables')
export class StockRoundtable extends BaseEntity {
  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  // 分析对象类型：market（大盘）/ index（指数）/ sector（板块）/ stock（个股）。
  @Column({ name: 'subject_type', length: 16 })
  subjectType!: string;

  // 对象代码：sh600519 / sh000001 / BK0475；大盘为空（内部按 sh000001 取数）。
  @Column({ name: 'subject_code', type: 'varchar', length: 32, nullable: true })
  subjectCode?: string | null;

  @Column({ name: 'subject_name', type: 'varchar', length: 64 })
  subjectName!: string;

  // 用户附加关注的问题。
  @Column({ type: 'varchar', length: 255, nullable: true })
  question?: string | null;

  // 会议模式：quick（独立+总结）/ standard（独立+1轮辩论）/ deep（独立+2轮辩论）。
  @Column({ length: 16, default: 'standard' })
  mode!: string;

  // 指定模型行（空 = 自动路由：智能体绑定模型 > 任意 chat 渠道）。
  @Column({ name: 'model_id', type: 'int', nullable: true })
  modelId?: number | null;

  // 会议状态：preparing / round1 / debating / summarizing / completed / failed。
  @Column({ type: 'varchar', length: 16, default: 'preparing' })
  status!: string;

  // 数据简报 JSON（快照 + 指标摘要 + 环境），不含完整 K 线序列。
  @Column({ name: 'brief_json', type: 'text', nullable: true })
  briefJson?: string | null;

  // 主席最终纪要全文。
  @Column({ name: 'summary_text', type: 'text', nullable: true })
  summaryText?: string | null;

  // 结构化结论 JSON：{ conclusion, votes, stances }。
  @Column({ name: 'consensus_json', type: 'text', nullable: true })
  consensusJson?: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 255, nullable: true })
  errorMessage?: string | null;

  @OneToMany(() => StockRoundtableTurn, (turn) => turn.roundtable, { cascade: true })
  turns!: StockRoundtableTurn[];
}
