// 文件落盘日志器单测：纯函数格式化 + 真实写盘行为（不依赖 Nest 容器与网络）。
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileTeeLogger, formatLogFileLine, logFileNameFor } from '../src/common/logging/file-logger';

describe('file-logger', () => {
  describe('纯函数', () => {
    it('logFileNameFor 按天滚动命名', () => {
      expect(logFileNameFor(new Date('2026-10-31T08:00:00Z'))).toBe('app-2026-10-31.log');
      expect(logFileNameFor(new Date('2026-01-05T23:59:59Z'))).toBe('app-2026-01-05.log');
    });

    it('formatLogFileLine 含时间/级别/上下文/消息', () => {
      const line = formatLogFileLine('ERROR', 'AuthService', '登录失败', undefined, new Date('2026-10-31T08:00:00Z'));
      expect(line).toBe('2026-10-31T08:00:00.000Z ERROR [AuthService] 登录失败\n');
    });

    it('formatLogFileLine 无上下文不带方括号，堆栈另起一行', () => {
      const line = formatLogFileLine('LOG', undefined, 'started', 'Error: x\n  at f', new Date('2026-10-31T08:00:00Z'));
      expect(line).toBe('2026-10-31T08:00:00.000Z LOG started\nError: x\n  at f\n');
    });

    it('formatLogFileLine 对非字符串消息做 JSON 序列化，循环引用退化为 String', () => {
      const objLine = formatLogFileLine('LOG', undefined, { a: 1 }, undefined, new Date('2026-10-31T08:00:00Z'));
      expect(objLine).toBe('2026-10-31T08:00:00.000Z LOG {"a":1}\n');

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const fallback = formatLogFileLine('LOG', undefined, circular, undefined, new Date('2026-10-31T08:00:00Z'));
      expect(fallback.startsWith('2026-10-31T08:00:00.000Z LOG ')).toBe(true);
      expect(fallback.endsWith('\n')).toBe(true);
    });
  });

  describe('FileTeeLogger 写盘', () => {
    let dir: string;
    let originalEnabled: string | undefined;
    let originalDir: string | undefined;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'file-logger-'));
      originalEnabled = process.env.LOG_FILE_ENABLED;
      originalDir = process.env.LOG_FILE_DIR;
      process.env.LOG_FILE_ENABLED = 'true';
      process.env.LOG_FILE_DIR = dir;
    });

    afterAll(() => {
      if (originalEnabled === undefined) {
        delete process.env.LOG_FILE_ENABLED;
      } else {
        process.env.LOG_FILE_ENABLED = originalEnabled;
      }
      if (originalDir === undefined) {
        delete process.env.LOG_FILE_DIR;
      } else {
        process.env.LOG_FILE_DIR = originalDir;
      }
      rmSync(dir, { recursive: true, force: true });
    });

    it('日志写入当天的滚动文件，堆栈完整落盘', async () => {
      const logger = new FileTeeLogger();
      logger.error('文件日志写入测试', 'Error: boom\n    at test', 'FileLoggerSpec');
      logger.log('普通消息');

      // 写盘是旁路异步，轮询等待落盘完成
      const file = join(dir, logFileNameFor(new Date()));
      for (let i = 0; i < 50 && (!readdirSync(dir).length || !readFileSync(file, 'utf8').includes('普通消息')); i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const content = readFileSync(file, 'utf8');
      expect(content).toContain('ERROR [FileLoggerSpec] 文件日志写入测试');
      expect(content).toContain('Error: boom');
      expect(content).toContain('LOG 普通消息');
    });

    it('未开启开关时不写文件', async () => {
      process.env.LOG_FILE_ENABLED = 'false';
      const logger = new FileTeeLogger();
      logger.log('不应落盘的消息');
      await new Promise((resolve) => setTimeout(resolve, 60));
      const content = readFileSync(join(dir, logFileNameFor(new Date())), 'utf8');
      expect(content).not.toContain('不应落盘的消息');
      // 恢复开关，避免影响其他用例
      process.env.LOG_FILE_ENABLED = 'true';
    });
  });
});
