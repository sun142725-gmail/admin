// 微服务网关控制器：前端跨服务请求统一走 /api/svc/:service/*。
// Node 侧完成 JWT 鉴权（JwtAuthGuard）与审计后，把请求流式透传给下游服务；
// 响应体（含 SSE）原样回传，不做二次包装——下游服务自己产出统一响应结构。
import { All, BadGatewayException, Controller, Get, GatewayTimeoutException, Logger, NotFoundException, Param, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { PROXY_DEFAULT_TIMEOUT_MS, PROXY_SERVICES } from './proxy-registry';

@ApiTags('Proxy')
@ApiBearerAuth()
@Controller('svc')
@UseGuards(JwtAuthGuard)
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly audit: AuditService) {}

  /** 服务注册表：当前网关接了哪些下游服务、转发到哪里。 */
  @Get()
  listServices() {
    return PROXY_SERVICES.map((service) => ({
      name: service.name,
      description: service.description,
      prefix: `/api/svc/${service.name}`,
      target: process.env[service.targetEnv] ?? service.defaultTarget,
      timeoutMs: service.timeoutMs ?? PROXY_DEFAULT_TIMEOUT_MS
    }));
  }

  /**
   * 通用转发：/api/svc/<name>/<rest> → <target>/<rest>。
   * 使用 @Res 直接写响应，绕过 ResponseInterceptor（透传不包装）。
   */
  @All(':service/*')
  async forward(@Param('service') service: string, @Req() req: Request, @Res() res: Response) {
    const definition = PROXY_SERVICES.find((item) => item.name === service);
    if (!definition) {
      throw new NotFoundException(`未注册的微服务: ${service}`);
    }
    const target = (process.env[definition.targetEnv] ?? definition.defaultTarget).replace(/\/+$/, '');
    if (!target) {
      throw new BadGatewayException(`微服务 ${service} 未配置目标地址（${definition.targetEnv}）`);
    }

    const prefix = `/api/svc/${service}`;
    const rest = req.path.startsWith(`${prefix}/`) ? req.path.slice(prefix.length + 1) : '';
    const query = req.url.slice(req.path.length);
    const url = `${target}/${rest}${query}`;

    // 请求体：JSON/表单已被 body-parser 解析成对象（重新序列化转发）；
    // 其余类型（multipart、二进制等）流未被消费，直接流式转发。
    let body: BodyInit | undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.readable) {
        body = Readable.toWeb(req) as unknown as BodyInit;
      } else if (req.body && Object.keys(req.body).length > 0) {
        body = JSON.stringify(req.body);
      }
    }

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const headers: Record<string, string> = {
      accept: (req.headers.accept as string) || '*/*',
      'x-request-id': requestId,
      'x-forwarded-user': String((req.user as { id?: number } | undefined)?.id ?? ''),
      'x-forwarded-username': String((req.user as { username?: string } | undefined)?.username ?? '')
    };
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }
    if (body !== undefined) {
      // 字符串体是重新序列化的 JSON；流式体保持原始 content-type
      headers['content-type'] = typeof body === 'string' ? 'application/json' : ((req.headers['content-type'] as string) || 'application/octet-stream');
    }

    const timeoutMs = definition.timeoutMs ?? PROXY_DEFAULT_TIMEOUT_MS;
    const abortController = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => abortController.abort(), timeoutMs) : null;
    const startedAt = Date.now();

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, {
        method: req.method,
        headers,
        body: body as BodyInit | undefined,
        signal: abortController.signal,
        // Node fetch 流式请求体必须显式声明 duplex
        ...(body && typeof body !== 'string' ? { duplex: 'half' } : {})
      });
    } catch (error) {
      if (abortController.signal.aborted && timer) {
        this.logger.warn(`微服务 ${service} 响应超时(${timeoutMs}ms): ${req.method} ${url}`);
        throw new GatewayTimeoutException(`微服务 ${service} 响应超时`);
      }
      this.logger.error(`微服务 ${service} 不可达: ${req.method} ${url} - ${error instanceof Error ? error.message : String(error)}`);
      throw new BadGatewayException(`微服务 ${service} 不可达`);
    }

    // 超时只约束"拿到响应头"；响应体（可能长时间流式输出）不再计时
    if (timer) {
      clearTimeout(timer);
    }

    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    res.setHeader('x-request-id', requestId);

    // 审计在响应结束时旁路写入，不影响业务结果（失败仅告警）
    res.on('finish', () => {
      void this.audit.log(
        'svc_proxy',
        'proxy',
        `${req.method} /svc/${service}/${rest}${query} -> ${upstream.status} (${Date.now() - startedAt}ms)`,
        (req.user as { id?: number } | undefined)?.id,
        req.ip
      );
    });

    try {
      await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream), res);
    } catch (error) {
      // 响应头已发出，无法再抛 HTTP 异常，只能断开连接
      this.logger.error(`微服务 ${service} 响应流中断: ${error instanceof Error ? error.message : String(error)}`);
      res.destroy();
    }
  }
}
