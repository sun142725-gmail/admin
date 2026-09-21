// SSE 响应头中间件：禁止 nginx 等反向代理缓冲流式响应，保证实时逐段到达。
// 必须用中间件而非拦截器：Nest 对 @Sse 路由在拦截器执行前就已发出响应头。
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';

@Injectable()
export class SseHeadersMiddleware implements NestMiddleware {
  use(_req: unknown, response: Response, next: NextFunction) {
    if (!response.headersSent) {
      response.setHeader('X-Accel-Buffering', 'no');
      response.setHeader('Cache-Control', 'no-cache');
    }
    next();
  }
}
