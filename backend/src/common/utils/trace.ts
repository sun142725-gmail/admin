// Trace 工具用于生成与传递链路追踪 ID。
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response } from 'express';

export const ensureTraceId = (request: Request, response?: Response) => {
  // 已有入口生成的 traceId（TraceMiddleware 先行）必须复用：
  // 否则中间件/拦截器/过滤器各生成一个，响应信封与 ALS 上下文、审计落库会对不上
  const existing = (request as { traceId?: string }).traceId;
  if (existing) {
    if (response) {
      response.setHeader('x-trace-id', existing);
    }
    return existing;
  }
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

// 请求级 traceId 上下文：中间件在入口用 ALS 建立存储，
// 服务层（如审计写入）无需层层透传 request 即可取到当前请求的 traceId
const traceStorage = new AsyncLocalStorage<{ traceId?: string }>();

export const runWithTrace = <T>(store: { traceId?: string }, fn: () => T): T =>
  traceStorage.run(store, fn);

export const currentTraceId = (): string | undefined => traceStorage.getStore()?.traceId;
