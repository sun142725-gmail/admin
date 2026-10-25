// 股市圆桌模块：行情数据 + 多专家圆桌编排。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockRoundtable } from '../../common/entities/stock-roundtable.entity';
import { StockRoundtableTurn } from '../../common/entities/stock-roundtable-turn.entity';
import { AiAgent } from '../../common/entities/ai-agent.entity';
import { AiModel } from '../../common/entities/ai-model.entity';
import { AiModule } from '../ai/ai.module';
import { MarketDataService } from './market/market-data.service';
import { SearchExecutorService } from './market/search-executor.service';
import { ExpertsService } from './experts.service';
import { RoundtableService } from './roundtable.service';
import { StockController, RoundtableController } from './stock.controller';
import { MarketDataController } from './market-data.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockRoundtable, StockRoundtableTurn, AiAgent, AiModel]), AiModule],
  providers: [MarketDataService, SearchExecutorService, ExpertsService, RoundtableService],
  controllers: [StockController, RoundtableController, MarketDataController]
})
export class StockModule {}
