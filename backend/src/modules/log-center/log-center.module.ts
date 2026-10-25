// 日志中心模块注册日志实体、服务与全局异常过滤（5xx 落库依赖 ErrorLog 仓库）。
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TrackLog } from '../../common/entities/track-log.entity';
import { FrontendLog } from '../../common/entities/frontend-log.entity';
import { ErrorLog } from '../../common/entities/error-log.entity';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { LogCenterController } from './log-center.controller';
import { LogCenterService } from './log-center.service';
import { LogCleanupService } from './log-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrackLog, FrontendLog, ErrorLog]), ScheduleModule],
  providers: [
    LogCenterService,
    LogCleanupService,
    // 异常过滤器需要注入 ErrorLog 仓库，因此从 main.ts 的手动实例化改为 DI 注册
    { provide: APP_FILTER, useClass: HttpExceptionFilter }
  ],
  controllers: [LogCenterController],
  exports: [LogCenterService]
})
export class LogCenterModule {}
