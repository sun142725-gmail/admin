// 字典项实体用于维护枚举值与多语言标签。
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Dict } from './dict.entity';

@Entity('dict_items')
@Index(['dictId'])
export class DictItem extends BaseEntity {
  @Column({ name: 'dict_id' })
  dictId!: number;

  @ManyToOne(() => Dict, (dict) => dict.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dict_id' })
  dict?: Dict;

  @Column()
  value!: string;

  @Column()
  label!: string;

  @Column({ name: 'label_i18n', type: 'json', nullable: true })
  labelI18n?: Record<string, string>;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ default: 1 })
  status!: number;

  @Column({ type: 'json', nullable: true })
  extra?: Record<string, unknown>;
}
