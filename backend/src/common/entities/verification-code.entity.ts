// 验证码实体用于登录、注册、找回密码场景。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('verification_codes')
@Index(['channel', 'target', 'scene'])
export class VerificationCode extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  scene!: string;

  @Column({ type: 'varchar', length: 32 })
  channel!: string;

  @Column({ type: 'varchar', length: 128 })
  target!: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 128 })
  codeHash!: string;

  @Column({ name: 'expire_at', type: 'datetime' })
  expireAt!: Date;

  @Column({ name: 'consumed_at', type: 'datetime', nullable: true })
  consumedAt?: Date;

  @Column({ name: 'request_ip', type: 'varchar', length: 64, nullable: true })
  requestIp?: string;

  @Column({ name: 'send_status', type: 'varchar', length: 32, default: 'pending' })
  sendStatus!: string;

  @Column({ name: 'fail_reason', type: 'varchar', length: 255, nullable: true })
  failReason?: string;
}
