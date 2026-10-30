// 内部接口鉴权：Go 服务通过 X-Internal-Token 调用，与用户 JWT 体系分离。
import { createHash, timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expected = process.env.INTERNAL_API_TOKEN;
    // 未配置密钥时拒绝所有内部调用（fail-closed，避免内网裸奔）。
    if (!expected) {
      throw new UnauthorizedException('INTERNAL_API_TOKEN 未配置，内部接口已禁用');
    }
    const provided = request.headers['x-internal-token'];
    if (typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException('内部接口令牌无效');
    }
    // 常量时间比较：两侧先 sha256 成 32 字节定长摘要再比（长度差被摘要吸收，
    // 规避逐字节比较的时序面；比较对象是摘要而非原文，语义等价且无提前短路）。
    const providedDigest = createHash('sha256').update(provided).digest();
    const expectedDigest = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(providedDigest, expectedDigest)) {
      throw new UnauthorizedException('内部接口令牌无效');
    }
    return true;
  }
}
