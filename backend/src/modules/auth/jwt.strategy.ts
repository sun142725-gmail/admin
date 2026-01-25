// JWT 策略用于校验 accessToken 与权限信息。
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../common/entities/user.entity';
import { TOKEN_TYPE_ACCESS } from '../../common/constants';
import { AuthPayload } from '../../common/interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET,
      ignoreExpiration: false
    });
  }

  async validate(payload: AuthPayload) {
    if (payload.typ !== TOKEN_TYPE_ACCESS) {
      throw new UnauthorizedException('无效令牌类型');
    }
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('用户不可用');
    }
    return {
      id: user.id,
      username: user.username,
      permissions: payload.permissions ?? [],
      roles: payload.roles ?? []
    };
  }
}
