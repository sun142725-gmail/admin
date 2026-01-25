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
      this.logger.warn(`Redis error: ${error?.message ?? error}`);
    });
  }

  private buildKey(code: string) {
    return `dict:${code}`;
  }

  async get(code: string): Promise<Record<string, unknown> | null> {
    if (!this.enabled || !this.client) {
      return null;
    }
    const cache = await this.client.get(this.buildKey(code));
    if (!cache) {
      return null;
    }
    try {
      return JSON.parse(cache);
    } catch {
      return null;
    }
  }

  async set(code: string, value: Record<string, unknown>) {
    if (!this.enabled || !this.client) {
      return;
    }
    await this.client.set(this.buildKey(code), JSON.stringify(value), 'EX', this.ttlSeconds);
  }

  async del(code: string) {
    if (!this.enabled || !this.client) {
      return;
    }
    await this.client.del(this.buildKey(code));
  }
}
