// 家庭公告实体保存房主发布的纯文本公告。
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Family } from './family.entity';
import { User } from './user.entity';

@Entity('family_announcements')
export class FamilyAnnouncement extends BaseEntity {
  @Column({ name: 'family_id' })
  familyId!: number;

  @ManyToOne(() => Family, (family) => family.announcements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family!: Family;

  @Column({ type: 'varchar', length: 30 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  content!: string;

  @Column({ name: 'publisher_id' })
  publisherId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'publisher_id' })
  publisher!: User;

  @Column({ name: 'published_at', type: 'datetime' })
  publishedAt!: Date;
}
