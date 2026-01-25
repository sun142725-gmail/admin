// Trace 工具用于生成与传递链路追踪 ID。
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

export const ensureTraceId = (request: Request, response?: Response) => {
  const headerTraceId = request.headers['x-trace-id'];
  const traceId =
    typeof headerTraceId === 'string' && headerTraceId.trim()
      ? headerTraceId
      : randomUUID();
  (request as { traceId?: string }).traceId = traceId;
  if (response) {
    response.setHeader('x-trace-id', traceId);
  }
  return traceId;
};
