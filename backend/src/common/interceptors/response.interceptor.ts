// 响应拦截器用于统一成功响应结构。
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_RESPONSE_WRAP_KEY } from '../constants';
import { ensureTraceId } from '../utils/trace';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // SSE 等特殊响应直接透传，不做统一包装。
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (skip) {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const response = httpContext.getResponse();
    const traceId = ensureTraceId(request, response);
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'success',
        data,
        timestamp: new Date().toISOString(),
        traceId
      }))
    );
  }
}
