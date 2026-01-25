// 日志中心模块注册日志实体与服务。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TrackLog } from '../../common/entities/track-log.entity';
import { FrontendLog } from '../../common/entities/frontend-log.entity';
import { ErrorLog } from '../../common/entities/error-log.entity';
import { LogCenterController } from './log-center.controller';
import { LogCenterService } from './log-center.service';
import { LogCleanupService } from './log-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrackLog, FrontendLog, ErrorLog]), ScheduleModule],
  providers: [LogCenterService, LogCleanupService],
  controllers: [LogCenterController],
  exports: [LogCenterService]
})
export class LogCenterModule {}
