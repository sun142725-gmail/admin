// 占卜爻实体用于记录每一爻的结果。
import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Divination } from './divination.entity';

@Entity('divination_lines')
export class DivinationLine extends BaseEntity {
  @Column({ name: 'divination_id' })
  divinationId!: number;

  @Column({ name: 'line_index' })
  lineIndex!: number;

  @Column({ name: 'sign_str' })
  signStr!: string;

  @Column()
  sum!: number;

  @Column()
  symbol!: string;

  @Column()
  name!: string;

  @ManyToOne(() => Divination, (divination) => divination.lines, { onDelete: 'CASCADE' })
  divination!: Divination;
}
