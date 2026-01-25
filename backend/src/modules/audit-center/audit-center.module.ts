// 日志中心模块注册日志实体与服务。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../common/entities/audit-log.entity';
import { AuditCenterService } from './audit-center.service';
import { AuditCenterController } from './audit-center.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditCenterService],
  controllers: [AuditCenterController]
})
export class AuditCenterModule {}
