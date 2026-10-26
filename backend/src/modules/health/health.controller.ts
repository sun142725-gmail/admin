// 健康检查端点：供 docker healthcheck / 负载均衡探针使用，无需认证（不泄露业务信息）。
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }
}
