// 占卜实体用于记录主题与解卦结果。
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DivinationLine } from './divination-line.entity';

@Entity('divinations')
export class Divination extends BaseEntity {
  @Column()
  topic!: string;

  @Column({ type: 'text', nullable: true })
  interpretation?: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @OneToMany(() => DivinationLine, (line) => line.divination, { cascade: true })
  lines!: DivinationLine[];
}
