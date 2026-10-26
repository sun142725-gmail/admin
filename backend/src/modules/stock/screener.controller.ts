// 股票选股控制器：金叉规则扫描（只读分析接口）+ 运行历史与手动触发。
import {
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { ScreenerScanDto } from './dto/screener-scan.dto';
import { ScreenerService } from './screener.service';
import { ScreenerScheduleService } from './screener-schedule.service';

@ApiTags('Stock Screener')
@ApiBearerAuth()
@Controller('stock/screener')
@UseGuards(JwtAuthGuard)
export class ScreenerController {
  constructor(
    private readonly screener: ScreenerService,
    private readonly schedule: ScreenerScheduleService
  ) {}

  /** 对候选池执行 KDJ/MACD 金叉规则扫描（日/周/月线）。 */
  @Post('scan')
  async scan(@Body() dto: ScreenerScanDto, @CurrentUser() user: RequestUser) {
    return this.screener.scan(dto, user.id);
  }

  // ==================== 每日扫描运行记录 ====================

  /** 扫描运行历史（分页，新的在前）。 */
  @Get('runs')
  async listRuns(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.screener.listRuns(Number(page ?? 1), Math.min(Number(pageSize ?? 20), 100));
  }

  /** 运行详情：运行记录 + 命中清单。 */
  @Get('runs/:id')
  async getRun(@Param('id', ParseIntPipe) id: number) {
    return this.screener.getRun(id);
  }

  /** 手动触发一次带记录的扫描（用默认收盘配置或请求体覆盖），后台执行，返回 runId。 */
  @Post('runs/trigger')
  async trigger(@Body() dto: ScreenerScanDto) {
    // 测试环境禁触发：默认配置是全市场 1500 只，e2e 里真跑会打爆上游接口
    if (process.env.NODE_ENV === 'test') {
      throw new ServiceUnavailableException('测试环境禁用触发扫描');
    }
    if (await this.screener.hasRunningRun()) {
      throw new ConflictException('已有扫描任务在运行中，请等待完成');
    }
    const runId = await this.schedule.execute(dto, false);
    return { runId };
  }
}
