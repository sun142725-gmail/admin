// 用户实体定义登录信息、账号类型与角色关联。
import { Column, Entity, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Role } from './role.entity';
import { UserIdentifier } from './user-identifier.entity';

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

  @Column({ name: 'user_type', type: 'varchar', length: 32, default: 'both' })
  userType!: string;

  @Column({ name: 'register_channel', type: 'varchar', length: 32, nullable: true })
  registerChannel?: string;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date;

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

  @OneToMany(() => UserIdentifier, (identifier) => identifier.user)
  identifiers!: UserIdentifier[];
}
