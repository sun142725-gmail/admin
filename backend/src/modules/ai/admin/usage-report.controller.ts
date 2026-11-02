// 用量聚合报表控制器：GET /ai/usage/report（权限 ai:usage:view，seed.service.ts:627 已有该码）。
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { UsageReportService, UsageReportVo } from './usage-report.service';
import { UsageReportQueryDto } from './dto/usage-report.dto';

@ApiTags('AI Admin')
@ApiBearerAuth()
@Controller('ai')
export class UsageReportController {
  constructor(private readonly reportService: UsageReportService) {}

  @Get('usage/report')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:usage:view')
  report(@Query() query: UsageReportQueryDto): Promise<UsageReportVo> {
    return this.reportService.report(query);
  }
}
