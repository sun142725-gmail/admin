// 字典缓存服务用于统一 Redis 缓存读写。
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class DictCacheService {
  private readonly logger = new Logger(DictCacheService.name);
  private readonly client?: Redis;
  private readonly enabled: boolean;
  private readonly ttlSeconds = Number(process.env.DICT_CACHE_TTL ?? 21600);

  constructor() {
    const host = process.env.REDIS_HOST;
    if (!host) {
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.client = new Redis({
      host,
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB ?? 0)
    });
    this.client.on('error', (error) => {
      this.logger.warn(`Redis error: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private buildKey(code: string) {
    return `dict:${code}`;
  }

  /** 缓存层故障静默降级：读 miss / 写忽略，业务穿透到 DB，不因 Redis 异常而 500。 */
  async get(code: string): Promise<Record<string, unknown> | null> {
    if (!this.enabled || !this.client) {
      return null;
    }
    try {
      const cache = await this.client.get(this.buildKey(code));
      if (!cache) {
        return null;
      }
      return JSON.parse(cache);
    } catch (error) {
      this.logger.warn(`字典缓存读取失败 code=${code}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async set(code: string, value: Record<string, unknown>) {
    if (!this.enabled || !this.client) {
      return;
    }
    try {
      await this.client.set(this.buildKey(code), JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.warn(`字典缓存写入失败 code=${code}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async del(code: string) {
    if (!this.enabled || !this.client) {
      return;
    }
    try {
      await this.client.del(this.buildKey(code));
    } catch (error) {
      this.logger.warn(`字典缓存删除失败 code=${code}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
