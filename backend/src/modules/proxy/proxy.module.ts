// 转发模块：把下游微服务挂到 /api/svc/* 之下，复用审计服务记录每次转发。
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProxyController } from './proxy.controller';

@Module({
  imports: [AuditModule],
  controllers: [ProxyController]
})
export class ProxyModule {}
