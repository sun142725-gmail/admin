// 日线行情库控制器：质量报表（只读）+ 手动补抓触发。
// 权限同宽挂宿主页码 stock:screener:use，不新增权限码（seed.service.ts 已 seed）：
// 报表 Tab 挂 /stock/screener 页（ScreenerPage 内 Tab，非新路由，无 resource seed 变更），
// 能进页者必持有该码——照 compliance.controller.ts:1-6 的「同宽」论证范式。
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { DailyBarsService } from './daily-bars.service';
import { QueryOverviewDto } from './dto/query-overview.dto';
import { QualityDetailDto } from './dto/quality-detail.dto';
import { TriggerBarsDto } from './dto/trigger-bars.dto';

@ApiTags('Stock Daily Bars')
@ApiBearerAuth()
@Controller('stock/daily-bars')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('stock:screener:use')
export class DailyBarsController {
  private readonly logger = new Logger(DailyBarsController.name);

  constructor(private readonly bars: DailyBarsService) {}

  /** 覆盖概览（池筛选 + 分页，SQL 聚合不做行级探针）。 */
  @Get('quality/overview')
  async overview(@Query() query: QueryOverviewDto) {
    return this.bars.qualityOverview(query);
  }

  /** 单标的质量明细（缺口/异常/跳变探针，纯函数实时计算不落库）。 */
  @Get('quality/detail')
  async detail(@Query() query: QualityDetailDto) {
    const symbols = query.symbols.split(',').map((s) => s.trim());
    return this.bars.qualityDetail(symbols);
  }

  /** 手动触发补抓（缺省=全宇宙增量；symbols≤50；full=true 单标的全量重抓）。后台执行，进度看后端日志。
   *  MVP 无 run 表故不返回 runId；固定 200：查询语义照 compliance check 先例，不落 Nest POST 默认 201。 */
  @Post('trigger')
  @HttpCode(200)
  async trigger(@Body() dto: TriggerBarsDto) {
    // 测试环境禁触发：e2e 真跑会打上游接口（照 screener.controller.ts 先例）
    if (process.env.NODE_ENV === 'test') {
      throw new ServiceUnavailableException('测试环境禁用触发补抓');
    }
    if (this.bars.isRunning()) {
      throw new ConflictException('已有补抓任务在运行中，请等待完成');
    }
    // 异步函数首个 await 前同步执行：运行锁在返回前已置位，并发 trigger 会被 409 挡住
    void this.bars.backfillUniverse(dto.symbols, { full: dto.full === true }).catch((error: unknown) =>
      // 服务层已逐标的兜底计数，此处仅防未处理拒绝并留日志
      this.logger.error(`手动补抓执行异常: ${error instanceof Error ? error.message : String(error)}`)
    );
    return { started: true };
  }
}
