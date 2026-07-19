// 验证码服务负责验证码生成、存储、发送与校验。
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { VerificationCode } from '../../common/entities/verification-code.entity';
import { NotificationTriggerService } from '../notification/notification-trigger.service';
import { sendSmsVerifyCode } from '../../utils/aliyun-sms';

const LOGIN_TEMPLATE_CODE = 'LOGIN_TEMPLATE_CODE';

@Injectable()
export class VerificationCodeService {
  constructor(
    @InjectRepository(VerificationCode)
    private readonly codeRepo: Repository<VerificationCode>,
    private readonly notificationTriggerService: NotificationTriggerService
  ) {}

  private hash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateCode() {
    return String(randomInt(100000, 1000000));
  }

  private getSceneLabel(scene: string) {
    const sceneLabelMap: Record<string, string> = {
      login: '登录',
      register: '注册',
      reset_password: '重置密码'
    };
    return sceneLabelMap[scene] ?? '验证码';
  }

  async sendCode(scene: string, channel: string, target: string, requestIp?: string) {
    const code = this.generateCode();
    const expireAt = new Date(Date.now() + 5 * 60 * 1000);
    const record = this.codeRepo.create({
      scene,
      channel,
      target,
      codeHash: this.hash(code),
      expireAt,
      requestIp,
      sendStatus: 'pending'
    });
    await this.codeRepo.save(record);

    try {
      if (channel === 'email') {
        const sceneLabel = this.getSceneLabel(scene);
        await this.notificationTriggerService.sendEmail({
          templateCode: LOGIN_TEMPLATE_CODE,
          emails: [target],
          title: `【红艾珊】${sceneLabel}验证码`,
          variables: {
            code,
            target,
            scene,
            sceneLabel,
            expireMinutes: '5',
            userNickname: target
          },
          extra: {
            scene,
            target,
            source: 'verification_code'
          },
          idempotencyKey: `verification:${scene}:${channel}:${target}:${record.id}`
        });
      } else {
        await sendSmsVerifyCode({
          phoneNumber: target,
          code,
          min: '5'
        });
      }
      record.sendStatus = 'sent';
      record.failReason = undefined;
    } catch (error) {
      record.sendStatus = 'failed';
      record.failReason = error instanceof Error ? error.message : '验证码发送失败';
      await this.codeRepo.save(record);
      throw new BadRequestException(record.failReason);
    }
    await this.codeRepo.save(record);
    return {
      success: true,
      target,
      channel,
      scene,
      code: process.env.NODE_ENV === 'production' ? undefined : code
    };
  }

  async verifyCode(scene: string, channel: string, target: string, code: string) {
    const record = await this.codeRepo.findOne({
      where: { scene, channel, target },
      order: { id: 'DESC' }
    });
    if (!record) {
      throw new UnauthorizedException('验证码无效');
    }
    if (record.consumedAt) {
      throw new UnauthorizedException('验证码已使用');
    }
    if (record.expireAt.getTime() < Date.now()) {
      throw new UnauthorizedException('验证码已过期');
    }
    if (record.codeHash !== this.hash(code)) {
      throw new UnauthorizedException('验证码错误');
    }
    record.consumedAt = new Date();
    await this.codeRepo.save(record);
    return record;
  }
}
