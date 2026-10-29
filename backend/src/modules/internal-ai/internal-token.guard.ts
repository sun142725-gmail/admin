// 内部接口鉴权：Go 服务通过 X-Internal-Token 调用，与用户 JWT 体系分离。
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
    if (provided !== expected) {
      throw new UnauthorizedException('内部接口令牌无效');
    }
    return true;
  }
}
