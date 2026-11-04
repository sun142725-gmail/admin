// 模拟盘调度/自选股联动 e2e（照 stock-backtest.spec.ts 全范式：NODE_ENV=test/SEED=false、
// 静态 DB fixture 不触网）。watchlist-tags 为登录用户组（仅 JwtAuthGuard，无权限码要求）——
// 策略配置与信号行直接经 repo 落库（fixture 不走 API，被测对象是查询口径本身）。
// 口径：近 5 交易日 = 该 symbol 日线库最近 5 个 bar 日窗口；仅 status∈(emitted,filled)；
// 停用策略不返回；skipped（含 no_bar）不进 tag。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { StockDailyBar } from '../src/common/entities/stock-daily-bar.entity';
import { StockStrategyConfig } from '../src/common/entities/stock-strategy-config.entity';
import { StockStrategySignal } from '../src/common/entities/stock-strategy-signal.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { MarketDataService } from '../src/modules/stock/market/market-data.service';
import { toUtcMidnight } from '../src/modules/stock/daily-bars/daily-bars-calib.util';

const workdays = (count: number, start = '2026-09-01'): string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const DATES = workdays(10); // d0..d9；sh600519 最近 5 个 bar 日窗口 = [d5..d9]，下界 d5

const fakeMarket = {
  quote: async (symbol: string) => ({ symbol, code: symbol.slice(2), name: '探针股', price: 10, prevClose: 10, open: 10, high: 10, low: 10, change: 0, changePct: 0, volume: 100, amountWan: 10, timestamp: '20261104000000' }),
  quotes: async (symbols: string[]) => Promise.all(symbols.map((s) => ({ symbol: s }))),
  kline: async () => ({ name: '探针股', items: [], source: 'eastmoney' }),
  sectors: async () => ({ total: 0, items: [] }),
  sectorInfo: async () => null,
  sectorConstituents: async () => [],
  search: async () => ({ stocks: [], sectors: [] }),
  overview: async () => ({ indexes: [], breadth: null, topSectors: [], bottomSectors: [] }),
  announcements: async () => [],
  financials: async () => null
};

describe('Stock Strategy schedule / watchlist-tags (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let configRepo: Repository<StockStrategyConfig>;
  let signalRepo: Repository<StockStrategySignal>;
  let enabledId: number;
  let enabledId2: number;
  let disabledId: number;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MarketDataService)
      .useValue(fakeMarket)
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    configRepo = moduleFixture.get<Repository<StockStrategyConfig>>(getRepositoryToken(StockStrategyConfig));
    signalRepo = moduleFixture.get<Repository<StockStrategySignal>>(getRepositoryToken(StockStrategySignal));
    const barRepo = moduleFixture.get<Repository<StockDailyBar>>(getRepositoryToken(StockDailyBar));

    // 日线库：sh600519 d0..d9（近 5 交易日窗口=d5..d9）；sh510300 仅 1 根（窗口=单日）；sz999999 无 bar
    for (const date of DATES) {
      await barRepo.insert({
        symbol: 'sh600519',
        tradeDate: toUtcMidnight(date)!,
        open: 10,
        high: 10,
        low: 10,
        close: 10,
        volume: 1000,
        amount: 10000
      } as StockDailyBar);
    }
    await barRepo.insert({
      symbol: 'sh510300',
      tradeDate: toUtcMidnight(DATES[8])!,
      open: 5,
      high: 5,
      low: 5,
      close: 5,
      volume: 1000,
      amount: 5000
    } as StockDailyBar);

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'strategy-schedule', passwordHash, status: 1 }));
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'strategy-schedule', password: 'password' })
      .expect(201);
    accessToken = login.body.data.accessToken;

    const insertConfig = async (name: string, enabled: boolean, symbols: string[]) =>
      (
        await configRepo.save(
          configRepo.create({
            name,
            template: 'ma-cross',
            params: {},
            symbols,
            initialCash: 100000,
            positionModel: null,
            enabled,
            simStartDate: '2026-09-01',
            remark: null,
            createdBy: null
          })
        )
      ).id;

    enabledId = await insertConfig('联动启用A', true, ['sh600519']);
    enabledId2 = await insertConfig('联动启用B', true, ['sh600519', 'sh510300']);
    disabledId = await insertConfig('联动停用C', false, ['sh600519']);

    const signal = (
      strategyId: number,
      date: string,
      symbol: string,
      action: string,
      status: string,
      skipReason: string | null
    ) =>
      signalRepo.save(
        signalRepo.create({
          strategyId,
          tradeDate: toUtcMidnight(date)!,
          symbol,
          action,
          status,
          skipReason,
          filledPrice: status === 'filled' ? 10 : null,
          shares: status === 'filled' ? 1000 : 0,
          fee: status === 'filled' ? 5 : null
        })
      );

    // 启用A：窗口内 filled（应返回）+ 窗口外 filled（不返回）+ 窗口内 skipped（不返回）
    await signal(enabledId, DATES[7], 'sh600519', 'buy', 'filled', null);
    await signal(enabledId, DATES[2], 'sh600519', 'sell', 'filled', null); // 窗口外
    await signal(enabledId, DATES[8], 'sh600519', 'buy', 'skipped', 'limit_up'); // skipped 不进 tag
    // 启用B：窗口内 emitted（应返回）+ no_bar skipped（不返回）
    await signal(enabledId2, DATES[9], 'sh600519', 'sell', 'emitted', null);
    await signal(enabledId2, DATES[8], 'sh510300', 'sell', 'skipped', 'no_bar');
    // 停用C：窗口内 filled（不返回）
    await signal(disabledId, DATES[8], 'sh600519', 'buy', 'filled', null);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns in-window emitted/filled signals of enabled strategies with the contract shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/stock/strategy/watchlist-tags?symbols=sh600519,sh510300')
      .set(auth())
      .expect(200);
    expect(response.body.data.items).toEqual([
      { symbol: 'sh600519', date: DATES[9], action: 'sell', strategyId: enabledId2, strategyName: '联动启用B' },
      { symbol: 'sh600519', date: DATES[7], action: 'buy', strategyId: enabledId, strategyName: '联动启用A' }
    ]);
  });

  it('never returns skipped signals (incl. no_bar) nor disabled-strategy signals', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/stock/strategy/watchlist-tags?symbols=sh600519,sh510300')
      .set(auth())
      .expect(200);
    const items = response.body.data.items;
    expect(items.every((item: { strategyId: number }) => item.strategyId !== disabledId)).toBe(true);
    expect(
      items.every((item: { date: string }) => item.date >= DATES[5]) // 全部落在近 5 交易日窗口内
    ).toBe(true);
  });

  it('symbols without bars yield no tags; missing/oversized symbols lists are 422', async () => {
    const noBars = await request(app.getHttpServer())
      .get('/api/stock/strategy/watchlist-tags?symbols=sz999999')
      .set(auth())
      .expect(200);
    expect(noBars.body.data.items).toEqual([]);

    await request(app.getHttpServer()).get('/api/stock/strategy/watchlist-tags').set(auth()).expect(422);

    const many = Array.from({ length: 101 }, (_, i) => `sh${String(600000 + i).padStart(6, '0')}`).join(',');
    await request(app.getHttpServer())
      .get(`/api/stock/strategy/watchlist-tags?symbols=${many}`)
      .set(auth())
      .expect(422);
  });
});
