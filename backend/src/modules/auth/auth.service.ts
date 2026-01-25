// 认证服务负责登录、刷新与退出逻辑。
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../common/entities/user.entity';
import { TOKEN_TYPE_ACCESS, TOKEN_TYPE_REFRESH } from '../../common/constants';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService
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
    await this.auditService.log('login', 'auth', `用户 ${username} 登录`, user.id, ip);
    return this.signTokens(user);
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
      avatarUrl: user.avatarUrl
    };
  }
}
