// 验证码服务负责验证码生成、存储、发送与校验。
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { VerificationCode } from '../../common/entities/verification-code.entity';
import { NotificationTriggerService } from '../notification/notification-trigger.service';
import { sendSmsVerifyCode } from '../../utils/aliyun-sms';

const LOGIN_TEMPLATE_CODE = 'LOGIN_TEMPLATE_CODE';
// 单条验证码最大校验失败次数：6 位码空间 90 万，不限次校验可在线暴力枚举
const MAX_VERIFY_FAILS = 5;

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
      if (process.env.NODE_ENV === 'test') {
        // 测试环境：不发真实短信/邮件，本地模拟发送成功（验证码哈希照常落库，校验流程全真）
      } else if (channel === 'email') {
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
      // 仅显式 development / test 回显验证码便于联调与测试断言；此前是"非 production 即回显"，
      // 线上一旦漏配 NODE_ENV，任意账号可经发码接口直接拿到验证码完成接管
      code:
        process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? code : undefined
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
      record.failCount += 1;
      if (record.failCount >= MAX_VERIFY_FAILS) {
        // 连续错太多次直接作废，逼迫重新获取
        record.consumedAt = new Date();
      }
      await this.codeRepo.save(record);
      throw new UnauthorizedException(
        record.failCount >= MAX_VERIFY_FAILS ? '错误次数过多，验证码已作废，请重新获取' : '验证码错误'
      );
    }
    record.consumedAt = new Date();
    await this.codeRepo.save(record);
    return record;
  }
}
