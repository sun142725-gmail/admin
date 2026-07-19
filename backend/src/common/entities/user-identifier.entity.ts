// 用户登录标识实体，承载手机号、邮箱等可验证账号。
import { Column, Entity, ManyToOne, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity('user_identifiers')
@Index(['identifierType', 'identifierValue'], { unique: true })
export class UserIdentifier extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: number;

  @ManyToOne(() => User, (user) => user.identifiers, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ name: 'identifier_type', type: 'varchar', length: 32 })
  identifierType!: string;

  @Column({ name: 'identifier_value', type: 'varchar', length: 128 })
  identifierValue!: string;

  @Column({ name: 'is_primary', type: 'tinyint', default: 1 })
  isPrimary!: number;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt?: Date;

  @Column({ type: 'tinyint', default: 1 })
  status!: number;
}
