// 日志清理任务用于定期删除过期日志。
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LogCenterService } from './log-center.service';

@Injectable()
export class LogCleanupService {
  constructor(private readonly logCenterService: LogCenterService) {}

  // 保留天数不在此处写死：由服务统一读取 LOG_RETENTION_DAYS，与查询窗口保持一致
  @Cron('0 3 * * *')
  async handleCleanup() {
    await this.logCenterService.cleanupExpired();
  }
}
