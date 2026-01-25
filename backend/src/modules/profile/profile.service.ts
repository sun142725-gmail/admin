// 个人中心服务负责资料与密码更新。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../common/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService
  ) {}

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return this.format(user);
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    await this.auditService.log('update_profile', 'profile', `更新资料 ${user.username}`, userId);
    return this.format(saved);
  }

  async updatePassword(userId: number, dto: UpdatePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const matched = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!matched) {
      throw new BadRequestException('旧密码错误');
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.tokenVersion += 1;
    await this.userRepo.save(user);
    await this.auditService.log('update_password', 'profile', `修改密码 ${user.username}`, userId);
    return { success: true };
  }

  private format(user: User) {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      avatarUrl: user.avatarUrl
    };
  }
}
