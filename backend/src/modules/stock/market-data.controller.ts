// 行情只读接口：搜索联想 / 实时快照 / K线+指标 / 大盘总览 / 板块列表。
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { computeIndicatorSeries } from './indicators.util';
import { MarketDataService } from './market/market-data.service';
import { normalizeSymbol } from './market/tencent-quote.api';

@ApiTags('Stock Market')
@ApiBearerAuth()
@Controller('stock/market')
@UseGuards(JwtAuthGuard)
export class MarketDataController {
  constructor(private readonly market: MarketDataService) {}

  @Get('search')
  async search(@Query('keyword') keyword?: string) {
    const kw = (keyword ?? '').trim();
    if (!kw) {
      return { stocks: [], sectors: [] };
    }
    return this.market.search(kw);
  }

  /** symbols 逗号分隔，如 sh600519,sh000001。 */
  @Get('quote')
  async quote(@Query('symbols') symbols?: string) {
    const list = (symbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (list.length === 0) {
      return [];
    }
    return this.market.quotes(list);
  }

  /** K 线 + 后端算好的指标序列（MA/MACD/KDJ/RSI/BOLL），前端直接绘图。 */
  @Get('kline')
  async kline(@Query('symbol') symbol?: string, @Query('limit') limit?: string) {
    const target = normalizeSymbol(symbol ?? '');
    const parsedLimit = Math.min(250, Math.max(30, Number(limit ?? 250) || 250));
    if (!/^(sh|sz)\d{6}$|^(BK\d{4,6}|new_[a-z0-9_]+)$/i.test(target)) {
      return { name: '', items: [], indicators: null };
    }
    const { name, items } = await this.market.kline(target, parsedLimit);
    return { name, items, indicators: computeIndicatorSeries(items) };
  }

  @Get('overview')
  async overview() {
    return this.market.overview();
  }

  @Get('sectors')
  async sectors(@Query('type') type?: string) {
    return this.market.sectors(type === 'concept' ? 'concept' : 'industry');
  }
}
