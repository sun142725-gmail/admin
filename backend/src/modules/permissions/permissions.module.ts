// 权限模块注册权限实体与服务。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../../common/entities/permission.entity';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Permission]), AuditModule],
  providers: [PermissionsService],
  controllers: [PermissionsController]
})
export class PermissionsModule {}
