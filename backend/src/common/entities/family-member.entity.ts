// 家庭成员实体记录用户在家庭内的角色、昵称与加入时间。
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Family } from './family.entity';
import { User } from './user.entity';

@Entity('family_members')
@Index(['familyId', 'userId'], { unique: true })
export class FamilyMember extends BaseEntity {
  @Column({ name: 'family_id' })
  familyId!: number;

  @ManyToOne(() => Family, (family) => family.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family!: Family;

  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20 })
  nickname!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: 'owner' | 'member';

  @Column({ name: 'joined_at', type: 'datetime' })
  joinedAt!: Date;
}
