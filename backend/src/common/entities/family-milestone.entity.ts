// 家庭大事纪实体记录个人与家庭的重要事件、核心标记和配图信息。
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Family } from './family.entity';
import { User } from './user.entity';

@Entity('family_milestones')
@Index('idx_milestone_list', ['familyId', 'type', 'happenDate'])
@Index('idx_milestone_summary', ['familyId', 'type', 'isCore', 'happenDate'])
@Index('idx_milestone_creator', ['creatorId'])
export class FamilyMilestone extends BaseEntity {
  @Column({ name: 'family_id' })
  familyId!: number;

  @ManyToOne(() => Family, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family!: Family;

  @Column({ type: 'varchar', length: 20 })
  type!: 'personal' | 'family';

  @Column({ type: 'varchar', length: 50 })
  title!: string;

  @Column({ name: 'happen_date', type: 'varchar', length: 10 })
  happenDate!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  desc!: string;

  @Column({ name: 'is_core', type: 'boolean', default: false })
  isCore!: boolean;

  @Column({ name: 'creator_id' })
  creatorId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator!: User;

  @Column({ name: 'creator_name', type: 'varchar', length: 50 })
  creatorName!: string;

  @Column({ name: 'related_member_ids', type: 'json' })
  relatedMemberIds!: number[];

  @Column({ name: 'image_list', type: 'json' })
  imageList!: string[];
}
