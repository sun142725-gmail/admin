// 家庭实体保存家庭基础信息、房主与头像配置。
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { FamilyMember } from './family-member.entity';
import { FamilyInviteCode } from './family-invite-code.entity';
import { FamilyTodo } from './family-todo.entity';
import { FamilyAnnouncement } from './family-announcement.entity';
import { FamilyMilestone } from './family-milestone.entity';

@Entity('families')
export class Family extends BaseEntity {
  @Column({ type: 'varchar', length: 20 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  avatar!: string;

  @Column({ name: 'owner_id' })
  ownerId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @OneToMany(() => FamilyMember, (member) => member.family)
  members!: FamilyMember[];

  @OneToMany(() => FamilyInviteCode, (inviteCode) => inviteCode.family)
  inviteCodes!: FamilyInviteCode[];

  @OneToMany(() => FamilyTodo, (todo) => todo.family)
  todos!: FamilyTodo[];

  @OneToMany(() => FamilyAnnouncement, (announcement) => announcement.family)
  announcements!: FamilyAnnouncement[];

  @OneToMany(() => FamilyMilestone, (milestone) => milestone.family)
  milestones!: FamilyMilestone[];
}
