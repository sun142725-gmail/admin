// 资源实体用于菜单与页面配置。
import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('resources')
export class Resource extends BaseEntity {
  @Column()
  name!: string;

  @Column()
  type!: string;

  @Column({ nullable: true })
  path?: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId?: number;

  @Column({ name: 'permission_code', nullable: true })
  permissionCode?: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;
}
