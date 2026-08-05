// 家庭待办实体承载家务任务、执行人、截止日期与完成状态。
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Family } from './family.entity';
import { User } from './user.entity';

@Entity('family_todos')
export class FamilyTodo extends BaseEntity {
  @Column({ name: 'family_id' })
  familyId!: number;

  @ManyToOne(() => Family, (family) => family.todos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family!: Family;

  @Column({ type: 'varchar', length: 50 })
  title!: string;

  @Column({ name: 'creator_id' })
  creatorId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator!: User;

  @Column({ name: 'assignee_id' })
  assigneeId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignee_id' })
  assignee!: User;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: 'pending' | 'completed';

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt?: Date | null;
}
