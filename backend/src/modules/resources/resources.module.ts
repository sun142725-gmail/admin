// 资源模块注册资源实体与服务。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '../../common/entities/resource.entity';
import { ResourcesService } from './resources.service';
import { ResourcesController } from './resources.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Resource]), AuditModule],
  providers: [ResourcesService],
  controllers: [ResourcesController]
})
export class ResourcesModule {}
