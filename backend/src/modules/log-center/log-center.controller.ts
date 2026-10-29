// 日志中心控制器提供批量上报与查询接口。
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { BatchEventsDto } from './dto/batch-events.dto';
import { QueryLogDto } from './dto/query-log.dto';
import { LogCenterService } from './log-center.service';

// 上报走 5 秒批量合并（每批最多 50 条），单独放宽限流避免挤占业务接口的全局配额导致日志被 429 丢弃
const INGEST_THROTTLE = { default: { limit: 240, ttl: 60000 } };

@ApiTags('LogCenter')
@Controller('log-center')
export class LogCenterController {
  constructor(private readonly logCenterService: LogCenterService) {}

  @Post('events')
  @Throttle(INGEST_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async ingest(@Body() body: BatchEventsDto, @Req() req: { user?: { id: number }; headers: any }) {
    const userId = req.user?.id;
    const headerSource = req.headers['x-source'];
    const source = body.source ?? (Array.isArray(headerSource) ? headerSource[0] : headerSource);
    const payload = { ...body, source };
    return this.logCenterService.ingestEvents(payload, userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:audit:center')
  async list(@Query() query: QueryLogDto) {
    return this.logCenterService.list(query);
  }

  // 链路聚合必须声明在 :type/:id 之前，否则 "trace/xxx" 会被通配路由当成 type=trace 命中详情
  @Get('trace/:traceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:audit:center')
  async trace(@Param('traceId') traceId: string) {
    if (!traceId || traceId.length > 128) {
      throw new BadRequestException('traceId 不合法');
    }
    return this.logCenterService.trace(traceId);
  }

  @Get(':type/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:audit:center')
  async detail(@Param('type') type: 'track' | 'frontend' | 'error', @Param('id', ParseIntPipe) id: number) {
    if (!['track', 'frontend', 'error'].includes(type)) {
      throw new BadRequestException('日志类型不正确');
    }
    return this.logCenterService.detail(type, id);
  }
}
