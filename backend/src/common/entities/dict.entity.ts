// 字典实体用于维护枚举分组与基础信息。
import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { DictItem } from './dict-item.entity';

@Entity('dicts')
export class Dict extends BaseEntity {
  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: 1 })
  status!: number;

  @OneToMany(() => DictItem, (item) => item.dict)
  items?: DictItem[];
}
