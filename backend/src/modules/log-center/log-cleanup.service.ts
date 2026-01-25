// 日志清理任务用于定期删除过期日志。
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LogCenterService } from './log-center.service';

@Injectable()
export class LogCleanupService {
  constructor(private readonly logCenterService: LogCenterService) {}

  @Cron('0 3 * * *')
  async handleCleanup() {
    await this.logCenterService.cleanupExpired(7);
  }
}
