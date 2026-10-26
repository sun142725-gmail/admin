// 占卜实体用于记录主题与解卦结果。
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DivinationLine } from './divination-line.entity';

@Entity('divinations')
// “我的占卜”列表按 userId 过滤分页，无索引时全表扫描
@Index(['userId'])
export class Divination extends BaseEntity {
  @Column()
  topic!: string;

  @Column({ type: 'text', nullable: true })
  interpretation?: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  // 解卦状态：casting（待述事）/ interpreting（解卦中）/ completed（已完成）/ failed（失败）。
  @Column({ type: 'varchar', length: 16, default: 'completed' })
  status!: string;

  // 本卦名，如"地天泰"。
  @Column({ name: 'hexagram_name', type: 'varchar', length: 64, nullable: true })
  hexagramName?: string | null;

  // 变卦名，存在动爻时才有。
  @Column({ name: 'changed_hexagram_name', type: 'varchar', length: 64, nullable: true })
  changedHexagramName?: string | null;

  // 解卦失败原因。
  @Column({ name: 'error_message', type: 'varchar', length: 255, nullable: true })
  errorMessage?: string | null;

  @OneToMany(() => DivinationLine, (line) => line.divination, { cascade: true })
  lines!: DivinationLine[];
}
