// 异常过滤器将错误统一为标准响应结构。
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Response } from 'express';
import { ensureTraceId } from '../utils/trace';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const traceId = ensureTraceId(request, response);
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器错误';
    let data: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status === HttpStatus.BAD_REQUEST) {
        status = HttpStatus.UNPROCESSABLE_ENTITY;
      }
      const errorResponse = exception.getResponse();
      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else if (typeof errorResponse === 'object' && errorResponse) {
        const payload = errorResponse as { message?: string | string[] };
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

    response.status(status).json({
      code: status,
      message,
      data,
      timestamp: new Date().toISOString(),
      traceId
    });
  }
}
