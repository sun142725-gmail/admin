// 回测控制器（方案 §2.7）：POST /api/stock/backtest/run，查询语义 @HttpCode(200)
// （照 daily-bars.controller.ts:50-52 先例，不落 Nest POST 默认 201）。
// 权限同宽挂宿主页码 stock:screener:use，不新增权限码（seed.service.ts:754 已 seed）：
// 回测 Tab 挂 /stock/screener 页（ScreenerPage 内第 4 个 Tab，非新路由，无 resource seed 变更），
// 能进页者必持有该码——照 daily-bars.controller.ts:1-4 的「同宽」论证范式。
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { BacktestService } from './backtest.service';
import { RunBacktestDto } from './dto/run-backtest.dto';

@ApiTags('Stock Backtest')
@ApiBearerAuth()
@Controller('stock/backtest')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('stock:screener:use')
export class BacktestController {
  constructor(private readonly backtest: BacktestService) {}

  /** 运行回测（内置 MA 演示信号，实时计算不落库）。固定 200：查询语义，无运行记录可返回。 */
  @Post('run')
  @HttpCode(200)
  async run(@Body() dto: RunBacktestDto) {
    return this.backtest.run(dto);
  }
}
