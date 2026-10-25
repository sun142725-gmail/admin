// 异常过滤器将错误统一为标准响应结构，并把服务端错误（5xx）落库到错误日志，
// 使前端上报的错误与后端根因可通过同一个 traceId 在审计中心关联检索。
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { ensureTraceId } from '../utils/trace';
import { ErrorLog } from '../entities/error-log.entity';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(
    @InjectRepository(ErrorLog)
    private readonly errorLogRepo: Repository<ErrorLog>
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const traceId = ensureTraceId(request, response);
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器错误';
    let data: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status === HttpStatus.BAD_REQUEST) {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
      }
      code = status;
      const errorResponse = exception.getResponse();
      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else if (typeof errorResponse === 'object' && errorResponse) {
        const payload = errorResponse as { code?: number; message?: string | string[] };
        if (typeof payload.code === 'number') {
          code = payload.code;
        }
        if (Array.isArray(payload.message)) {
          message = payload.message.join('; ');
        } else if (payload.message) {
          message = payload.message;
        }
      }
      if (status >= 500) {
        this.logger.error(
          `[${traceId}] ${request.method} ${request.url} -> ${status} ${message}`,
          exception.stack
        );
      }
    } else {
      const error = exception as Error;
      const detail = error?.message ?? 'Unknown error';
      this.logger.error(
        `[${traceId}] ${request.method} ${request.url} -> 500 ${detail}`,
        error?.stack
      );
      if (process.env.NODE_ENV !== 'production' && detail) {
        message = detail;
      }
    }

    // 4xx 属于客户端问题且前端会自行上报，这里只落库服务端错误（5xx）
    if (status >= 500) {
      this.persistServerError({
        traceId,
        status,
        code,
        message,
        stack: exception instanceof Error ? exception.stack : undefined,
        request
      });
    }

    response.status(status).json({
      code,
      message,
      data,
      timestamp: new Date().toISOString(),
      traceId
    });
  }

  // 旁路写入：落库失败只打控制台日志，绝不影响错误响应本身
  private persistServerError(event: {
    traceId: string;
    status: number;
    code: number;
    message: string;
    stack?: string;
    request: { method?: string; url?: string; user?: { id?: number } };
  }) {
    const { traceId, status, code, message, stack, request } = event;
    const entity = this.errorLogRepo.create({
      userId: request.user?.id,
      traceId,
      source: 'server',
      message: `${request.method ?? ''} ${request.url ?? ''} -> ${status} ${message}`.trim(),
      stack,
      meta: { method: request.method, url: request.url, status, code }
    });
    void this.errorLogRepo.save(entity).catch((error) => {
      this.logger.error(
        `服务端错误日志落库失败 traceId=${traceId}: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }
}
