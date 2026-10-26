// 自选股控制器：收藏清单的增删查（登录用户各自独立）。
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { WatchlistAddDto, WatchlistUpdateDto } from './dto/watchlist.dto';
import { WatchlistService } from './watchlist.service';

@ApiTags('Stock Watchlist')
@ApiBearerAuth()
@Controller('stock/watchlist')
@UseGuards(JwtAuthGuard)
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return { items: await this.watchlist.list(user.id) };
  }

  @Post()
  async add(@Body() dto: WatchlistAddDto, @CurrentUser() user: RequestUser) {
    return this.watchlist.add(user.id, dto);
  }

  /** 编辑备注/分组。 */
  @Patch(':symbol')
  async update(
    @Param('symbol') symbol: string,
    @Body() dto: WatchlistUpdateDto,
    @CurrentUser() user: RequestUser
  ) {
    return this.watchlist.update(user.id, symbol.toLowerCase(), dto);
  }

  @Delete(':symbol')
  async remove(@Param('symbol') symbol: string, @CurrentUser() user: RequestUser) {
    return this.watchlist.remove(user.id, symbol.toLowerCase());
  }
}
