// 文件落盘日志器：把 NestJS 控制台日志旁路写入按天滚动的日志文件。
// 仅在 LOG_FILE_ENABLED=true 时生效；文件写入失败只吞掉异常，绝不影响控制台输出与业务。
import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { appendFile } from 'fs/promises';
import { join } from 'path';

// 纯函数：按天滚动文件名（便于单测与外部复用）
export const logFileNameFor = (now: Date): string => `app-${now.toISOString().slice(0, 10)}.log`;

// 纯函数：单行日志格式（ISO 时间 + 级别 + 上下文 + 消息 + 堆栈），便于 grep 与日志平台采集
export const formatLogFileLine = (
  level: string,
  context: string | undefined,
  message: unknown,
  stack: string | undefined,
  now: Date
): string => {
  let text: string;
  if (typeof message === 'string') {
    text = message;
  } else {
    try {
      text = JSON.stringify(message) ?? String(message);
    } catch {
      // 循环引用等无法序列化的对象退化为 String，不让日志写文件抛异常
      text = String(message);
    }
  }
  const ctx = context ? `[${context}] ` : '';
  const stackPart = stack ? `\n${stack}` : '';
  return `${now.toISOString()} ${level} ${ctx}${text}${stackPart}\n`;
};

interface FileTeeOptions {
  enabled?: boolean;
  dir?: string;
}

export class FileTeeLogger extends ConsoleLogger {
  private readonly fileEnabled: boolean;
  private readonly fileDir: string;
  private dirEnsured = false;

  constructor(options: FileTeeOptions = {}) {
    super();
    this.fileEnabled = options.enabled ?? process.env.LOG_FILE_ENABLED === 'true';
    this.fileDir = options.dir ?? process.env.LOG_FILE_DIR ?? join(process.cwd(), 'logs');
  }

  // ConsoleLogger 的可变参签名会把显式传入的 undefined context 当第二条消息打印，
  // 因此按参数存在性分别调用，而不是 super.log(message, context) 直传
  log(message: unknown, context?: string) {
    if (context === undefined) {
      super.log(message);
    } else {
      super.log(message, context);
    }
    this.write('LOG', message, context, undefined);
  }

  warn(message: unknown, context?: string) {
    if (context === undefined) {
      super.warn(message);
    } else {
      super.warn(message, context);
    }
    this.write('WARN', message, context, undefined);
  }

  error(message: unknown, stack?: string, context?: string) {
    if (stack === undefined && context === undefined) {
      super.error(message);
    } else if (context === undefined) {
      super.error(message, stack);
    } else {
      super.error(message, stack, context);
    }
    this.write('ERROR', message, context, stack);
  }

  debug(message: unknown, context?: string) {
    if (context === undefined) {
      super.debug(message);
    } else {
      super.debug(message, context);
    }
    this.write('DEBUG', message, context, undefined);
  }

  verbose(message: unknown, context?: string) {
    if (context === undefined) {
      super.verbose(message);
    } else {
      super.verbose(message, context);
    }
    this.write('VERBOSE', message, context, undefined);
  }

  private write(level: LogLevel | string, message: unknown, context?: string, stack?: string) {
    if (!this.fileEnabled) {
      return;
    }
    try {
      if (!this.dirEnsured) {
        mkdirSync(this.fileDir, { recursive: true });
        this.dirEnsured = true;
      }
      const now = new Date();
      const line = formatLogFileLine(level, context, message, stack, now);
      // 旁路异步追加：不 await，落盘慢不拖累请求；失败只吞异常（磁盘满/权限等）
      void appendFile(join(this.fileDir, logFileNameFor(now)), line, 'utf8').catch(
        () => undefined
      );
    } catch {
      // 目录创建失败（权限/磁盘）同样静默：文件日志是增强能力，不能反过来打崩服务
    }
  }
}
