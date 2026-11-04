// 策略管理控制器（API 契约 §7）：管理端组（新权限码 stock:strategy:manage）+ 登录用户组
// （watchlist-tags 仅 JwtAuthGuard——照 stock.controller.ts:1-3「权限码仅用于菜单可见性」论证：
//  自选股页为登录用户私有数据，策略信号标签是只读联动，能登录即可见）。
// 统一响应 {code,message,data}（ResponseInterceptor）；服务层校验失败抛 BadRequestException → 422。
// 路由声明顺序：watchlist-tags 必须在 :id 之前（Nest 按声明顺序匹配，防被 :id 吞掉）。
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/auth.interface';
import { StrategyService } from './strategy.service';
import {
  CreateStrategyDto,
  StrategyBacktestDto,
  UpdateStrategyDto
} from './dto/strategy-config.dto';

@ApiTags('Stock Strategy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock/strategy')
export class StrategyController {
  constructor(private readonly strategy: StrategyService) {}

  // ---------- 登录用户组 ----------

  /** 自选股策略信号标签（≤100 代码；近 5 交易日窗口按日线库逐 symbol 推算）。 */
  @Get('watchlist-tags')
  async watchlistTags(@Query('symbols') symbols?: string) {
    return this.strategy.watchlistTags(symbols ?? '');
  }

  // ---------- 管理端组 ----------

  /** 创建策略（重名 422；模板/参数/标的池校验在服务层）。 */
  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('stock:strategy:manage')
  async create(@Body() dto: CreateStrategyDto, @CurrentUser() user?: RequestUser) {
    return this.strategy.create(dto, user?.id);
  }

  /** 分页列表（含账户摘要与最新信号数）。 */
  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('stock:strategy:manage')
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('template') template?: string,
    @Query('enabled') enabled?: string
  ) {
    return this.strategy.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      template,
      enabled
    });
  }

  /** 详情（配置 + 账户 + 持仓 + 最近信号）。 */
  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('stock:strategy:manage')
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.strategy.getDetail(id);
  }

  /** 更新（全字段可选 + enabled；warning 为「下轮按新口径全量重建投影」UX 提示）。 */
  @Put(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('stock:strategy:manage')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStrategyDto) {
    return this.strategy.update(id, dto);
  }

  /** 删除（事务级联删信号/持仓/账户行）。 */
  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('stock:strategy:manage')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.strategy.remove(id);
  }

  /** 手动运行模拟盘（定时手动共用 runStrategy 核心；@HttpCode(200) 查询语义）。 */
  @Post(':id/run')
  @HttpCode(200)
  @UseGuards(PermissionsGuard)
  @Permissions('stock:strategy:manage')
  async run(@Param('id', ParseIntPipe) id: number) {
    return this.strategy.runManual(id);
  }

  /** 策略回测（单标的=内核契约原样；轮动=PortfolioBacktestRunResult 分组配对口径）。 */
  @Post(':id/backtest')
  @HttpCode(200)
  @UseGuards(PermissionsGuard)
  @Permissions('stock:strategy:manage')
  async backtest(@Param('id', ParseIntPipe) id: number, @Body() dto: StrategyBacktestDto) {
    return this.strategy.backtest(id, dto);
  }
}
