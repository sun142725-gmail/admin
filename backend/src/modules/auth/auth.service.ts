// 认证服务负责登录、刷新与退出逻辑。
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../common/entities/user.entity';
import { UserIdentifier } from '../../common/entities/user-identifier.entity';
import { TOKEN_TYPE_ACCESS, TOKEN_TYPE_REFRESH } from '../../common/constants';
import { AuditService } from '../audit/audit.service';
import { VerificationCodeService } from './verification-code.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserIdentifier)
    private readonly identifierRepo: Repository<UserIdentifier>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly verificationCodeService: VerificationCodeService
  ) {}

  private async buildUserPayload(user: User) {
    const roles = user.roles?.map((role) => role.code) ?? [];
    const permissions = new Set<string>();
    user.roles?.forEach((role) => {
      role.permissions?.forEach((permission) => permissions.add(permission.code));
    });
    return {
      sub: user.id,
      username: user.username,
      tokenVersion: user.tokenVersion,
      roles,
      permissions: Array.from(permissions)
    };
  }

  private async signTokens(user: User) {
    const payload = await this.buildUserPayload(user);
    const accessToken = await this.jwtService.signAsync(
      { ...payload, typ: TOKEN_TYPE_ACCESS },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m'
      }
    );
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, typ: TOKEN_TYPE_REFRESH },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d'
      }
    );
    return { accessToken, refreshToken, profile: payload };
  }

  async validateUser(username: string, password: string) {
    const user = await this.userRepo.findOne({
      where: { username },
      relations: ['roles', 'roles.permissions']
    });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('账号或密码错误');
    }
    return user;
  }

  async login(username: string, password: string, ip?: string) {
    const user = await this.validateUser(username, password);
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);
    await this.auditService.log('login', 'auth', `用户 ${username} 登录`, user.id, ip);
    return this.signTokens(user);
  }

  private normalizeTarget(channel: string, target: string) {
    return channel === 'email' ? target.trim().toLowerCase() : target.trim();
  }

  private buildUsername(channel: string, target: string) {
    const normalized = this.normalizeTarget(channel, target).replace(/[^a-zA-Z0-9]/g, '_');
    return `${channel}_${normalized}`.slice(0, 64);
  }

  private async ensureUniqueUsername(base: string) {
    let username = base;
    let suffix = 1;
    while (await this.userRepo.findOne({ where: { username } })) {
      username = `${base}_${suffix++}`;
    }
    return username;
  }

  private async createOrBindIdentifier(channel: string, target: string, registerChannel: string) {
    const normalized = this.normalizeTarget(channel, target);
    const existingIdentifier = await this.identifierRepo.findOne({
      where: { identifierType: channel, identifierValue: normalized },
      relations: ['user']
    });
    const existingUser = existingIdentifier?.user
      ? existingIdentifier.user
      : existingIdentifier?.userId
        ? await this.userRepo.findOne({ where: { id: existingIdentifier.userId } })
        : null;
    if (existingUser) {
      return existingUser;
    }
    const username = await this.ensureUniqueUsername(this.buildUsername(channel, target));
    const passwordHash = await bcrypt.hash(`${Date.now()}_${Math.random()}`, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        username,
        passwordHash,
        status: 1,
        userType: 'c_end',
        registerChannel
      })
    );
    await this.identifierRepo.save(
      this.identifierRepo.create({
        userId: user.id,
        identifierType: channel,
        identifierValue: normalized,
        isPrimary: 1,
        status: 1,
        verifiedAt: new Date()
      })
    );
    return user;
  }

  private async findUserByIdentifier(channel: string, target: string) {
    const identifier = await this.identifierRepo.findOne({
      where: { identifierType: channel, identifierValue: this.normalizeTarget(channel, target) },
      relations: ['user']
    });
    if (!identifier) {
      return null;
    }
    return identifier.user ?? this.userRepo.findOne({ where: { id: identifier.userId } });
  }

  async sendCode(scene: string, channel: string, target: string, ip?: string) {
    const normalized = this.normalizeTarget(channel, target);
    return this.verificationCodeService.sendCode(scene, channel, normalized, ip);
  }

  async codeLogin(channel: string, target: string, code: string, ip?: string) {
    const normalized = this.normalizeTarget(channel, target);
    await this.verificationCodeService.verifyCode('login', channel, normalized, code);
    let user: User;
    try {
      user = await this.createOrBindIdentifier(channel, normalized, channel);
    } catch (error) {
      const duplicated = error instanceof QueryFailedError && /Duplicate entry/i.test(String(error.message));
      const existingUser = duplicated ? await this.findUserByIdentifier(channel, normalized) : null;
      if (!existingUser) {
        throw error;
      }
      user = existingUser;
    }
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);
    await this.auditService.log('login', 'auth', `用户 ${user.username} 验证码登录`, user.id, ip);
    const signedUser = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['roles', 'roles.permissions']
    });
    if (!signedUser) {
      throw new UnauthorizedException('用户不存在');
    }
    return this.signTokens(signedUser);
  }

  async codeResetPassword(channel: string, target: string, code: string, newPassword: string, ip?: string) {
    const normalized = this.normalizeTarget(channel, target);
    await this.verificationCodeService.verifyCode('reset_password', channel, normalized, code);
    const identifier = await this.identifierRepo.findOne({
      where: [
        { identifierType: channel, identifierValue: normalized },
        { identifierValue: normalized }
      ],
      relations: ['user']
    });
    const user = identifier?.user
      ? identifier.user
      : identifier?.userId
        ? await this.userRepo.findOne({ where: { id: identifier.userId } })
        : null;
    if (!user) {
      throw new BadRequestException('账号不存在');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.tokenVersion += 1;
    await this.userRepo.save(user);
    await this.auditService.log('reset_password', 'auth', `验证码重置密码 ${user.username}`, user.id, ip);
    return { success: true };
  }

  async refresh(refreshToken: string, ip?: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      });
      if (payload.typ !== TOKEN_TYPE_REFRESH) {
        throw new ForbiddenException('刷新令牌类型错误');
      }
      const user = await this.userRepo.findOne({
        where: { id: payload.sub },
        relations: ['roles', 'roles.permissions']
      });
      if (!user || user.status !== 1) {
        throw new UnauthorizedException('用户状态不可用');
      }
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('刷新令牌已失效');
      }
      await this.auditService.log('refresh', 'auth', `用户 ${user.username} 刷新令牌`, user.id, ip);
      return this.signTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('刷新令牌无效');
    }
  }

  async logout(userId: number, ip?: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    user.tokenVersion += 1;
    await this.userRepo.save(user);
    await this.auditService.log('logout', 'auth', `用户 ${user.username} 退出登录`, user.id, ip);
    return { success: true };
  }

  async profile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles', 'roles.permissions']
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    const payload = await this.buildUserPayload(user);
    return {
      ...payload,
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      avatarUrl: user.avatarUrl,
      userType: user.userType,
      registerChannel: user.registerChannel,
      lastLoginAt: user.lastLoginAt
    };
  }
}
