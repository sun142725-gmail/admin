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
import { ScreenerService } from './screener.service';
import { ScreenerScheduleService } from './screener-schedule.service';
import { WatchlistService } from './watchlist.service';
import { StockWatchlist } from '../../common/entities/stock-watchlist.entity';
import { StockScreenerRun } from '../../common/entities/stock-screener-run.entity';
import { StockScreenerHit } from '../../common/entities/stock-screener-hit.entity';
import { StockDailyBar } from '../../common/entities/stock-daily-bar.entity';
import { StockStrategyConfig } from '../../common/entities/stock-strategy-config.entity';
import { StockStrategySignal } from '../../common/entities/stock-strategy-signal.entity';
import { StockStrategyPosition } from '../../common/entities/stock-strategy-position.entity';
import { StockStrategyAccount } from '../../common/entities/stock-strategy-account.entity';
import { DailyBarsService } from './daily-bars/daily-bars.service';
import { DailyBarsScheduleService } from './daily-bars/daily-bars-schedule.service';
import { DailyBarsController } from './daily-bars/daily-bars.controller';
import { BacktestService } from './backtest/backtest.service';
import { BacktestController } from './backtest/backtest.controller';
import { StrategyService } from './strategy/strategy.service';
import { StrategyScheduleService } from './strategy/strategy-schedule.service';
import { StrategyController } from './strategy/strategy.controller';
import { StockController, RoundtableController } from './stock.controller';
import { MarketDataController } from './market-data.controller';
import { ScreenerController } from './screener.controller';
import { WatchlistController } from './watchlist.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockRoundtable,
      StockRoundtableTurn,
      AiAgent,
      AiModel,
      StockWatchlist,
      StockScreenerRun,
      StockScreenerHit,
      StockDailyBar,
      StockStrategyConfig,
      StockStrategySignal,
      StockStrategyPosition,
      StockStrategyAccount
    ]),
    AiModule
  ],
  providers: [
    MarketDataService,
    SearchExecutorService,
    ExpertsService,
    RoundtableService,
    ScreenerService,
    ScreenerScheduleService,
    WatchlistService,
    DailyBarsService,
    DailyBarsScheduleService,
    BacktestService,
    StrategyService,
    StrategyScheduleService
  ],
  controllers: [
    StockController,
    RoundtableController,
    MarketDataController,
    ScreenerController,
    WatchlistController,
    DailyBarsController,
    BacktestController,
    StrategyController
  ]
})
export class StockModule {}
