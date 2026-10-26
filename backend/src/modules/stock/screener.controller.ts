// 股票选股控制器：金叉规则扫描（只读分析接口）。
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { ScreenerScanDto } from './dto/screener-scan.dto';
import { ScreenerService } from './screener.service';

@ApiTags('Stock Screener')
@ApiBearerAuth()
@Controller('stock/screener')
@UseGuards(JwtAuthGuard)
export class ScreenerController {
  constructor(private readonly screener: ScreenerService) {}

  /** 对候选池执行 KDJ/MACD 金叉规则扫描（日/周/月线）。 */
  @Post('scan')
  async scan(@Body() dto: ScreenerScanDto, @CurrentUser() user: RequestUser) {
    return this.screener.scan(dto, user.id);
  }
}
