// 验证码服务负责验证码生成、存储与校验。
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { VerificationCode } from '../../common/entities/verification-code.entity';

@Injectable()
export class VerificationCodeService {
  constructor(
    @InjectRepository(VerificationCode)
    private readonly codeRepo: Repository<VerificationCode>
  ) {}

  private hash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateCode() {
    return String(randomInt(100000, 1000000));
  }

  async sendCode(scene: string, channel: string, target: string, requestIp?: string) {
    const code = this.generateCode();
    const expireAt = new Date(Date.now() + 5 * 60 * 1000);
    await this.codeRepo.save(
      this.codeRepo.create({
        scene,
        channel,
        target,
        codeHash: this.hash(code),
        expireAt,
        requestIp,
        sendStatus: 'sent'
      })
    );
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
