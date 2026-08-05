// 用户设置实体保存移动端个人设置项。
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity('user_settings')
@Index(['userId'], { unique: true })
export class UserSetting extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'current_family_id', nullable: true })
  currentFamilyId?: number;

  @Column({ name: 'notification_enabled', type: 'tinyint', default: 1 })
  notificationEnabled!: number;
}
