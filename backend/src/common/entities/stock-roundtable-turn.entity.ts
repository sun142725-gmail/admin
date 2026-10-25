// 圆桌发言：某位专家在某一轮的完整发言与解析出的机器可读立场。
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { StockRoundtable } from './stock-roundtable.entity';

@Index(['roundtableId'])
@Entity('stock_roundtable_turns')
export class StockRoundtableTurn extends BaseEntity {
  @Column({ name: 'roundtable_id' })
  roundtableId!: number;

  // 轮次：1 = 独立分析，2 起为辩论轮。
  @Column({ default: 1 })
  round!: number;

  @Column({ name: 'expert_code', type: 'varchar', length: 32 })
  expertCode!: string;

  @Column({ name: 'expert_name', type: 'varchar', length: 64 })
  expertName!: string;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  // 机器可读立场 JSON：{ direction, confidence, keyPoints }。
  @Column({ name: 'stance_json', type: 'text', nullable: true })
  stanceJson?: string | null;

  // ok / failed。
  @Column({ length: 16, default: 'ok' })
  status!: string;

  @ManyToOne(() => StockRoundtable, (roundtable) => roundtable.turns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roundtable_id' })
  roundtable!: StockRoundtable;
}
