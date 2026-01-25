// 日志中心控制器提供分页与详情接口。
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuditCenterService } from './audit-center.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('AuditCenter')
@ApiBearerAuth()
@Controller('audit-center')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditCenterController {
  constructor(private readonly auditCenterService: AuditCenterService) {}

  @Get()
  @Permissions('system:audit:center')
  async list(@Query() query: QueryAuditDto) {
    return this.auditCenterService.list(query);
  }

  @Get(':id')
  @Permissions('system:audit:center')
  async detail(@Param('id') id: string) {
    return this.auditCenterService.detail(Number(id));
  }
}
