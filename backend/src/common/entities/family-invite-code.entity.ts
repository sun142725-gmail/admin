// 家庭邀请码实体保存当前有效的邀请码与过期时间。
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Family } from './family.entity';

@Entity('family_invite_codes')
@Index(['code'], { unique: true })
export class FamilyInviteCode extends BaseEntity {
  @Column({ type: 'varchar', length: 6 })
  code!: string;

  @Column({ name: 'family_id' })
  familyId!: number;

  @ManyToOne(() => Family, (family) => family.inviteCodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family!: Family;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive!: number;
}
