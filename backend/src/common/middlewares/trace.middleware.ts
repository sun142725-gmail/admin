// 链路追踪中间件：请求入口确保 traceId 存在，并建立 ALS 上下文供服务层读取。
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ensureTraceId, runWithTrace } from '../utils/trace';

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const traceId = ensureTraceId(req, res);
    runWithTrace({ traceId }, next);
  }
}
