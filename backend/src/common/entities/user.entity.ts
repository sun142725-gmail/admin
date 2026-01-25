// 用户实体定义登录信息与角色关联。
import { Column, Entity, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Role } from './role.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  username!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ nullable: true })
  nickname?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Column({ type: 'tinyint', default: 1 })
  status!: number;

  @Column({ name: 'token_version', default: 0 })
  tokenVersion!: number;

  @ManyToMany(() => Role, (role) => role.users, { cascade: ['insert', 'update'] })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' }
  })
  roles!: Role[];
}
