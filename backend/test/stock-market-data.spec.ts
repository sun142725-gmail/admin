// 行情市场数据 e2e：K 线 freq 周期参数全链路透传（复现 controller 丢参 bug）+ 代码白名单。
// MarketDataService 以 fake 覆盖（jest.fn() 记录调用入参），不触网；controller 行为（白名单/回落）直接可断言。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { MarketDataService } from '../src/modules/stock/market/market-data.service';
import { KlineItem } from '../src/modules/stock/indicators.util';

// 最小静态 K 线：controller 会对其 computeIndicatorSeries（短序列各指标为 null 序列，安全）。
const STATIC_KLINES: KlineItem[] = [
  { date: '2026-10-28', open: 10, close: 10.5, high: 10.8, low: 9.9, volume: 100, amount: 1050 },
  { date: '2026-10-29', open: 10.5, close: 11, high: 11.2, low: 10.4, volume: 120, amount: 1260 },
  { date: '2026-10-30', open: 11, close: 11.5, high: 11.8, low: 10.9, volume: 140, amount: 1470 }
];

const klineMock = jest.fn().mockResolvedValue({ name: '贵州茅台', items: STATIC_KLINES });

const fakeMarket = {
  quote: async (symbol: string) => ({
    symbol,
    code: symbol.slice(2),
    name: '贵州茅台',
    price: 11,
    prevClose: 10.5,
    open: 10.2,
    high: 11.8,
    low: 10.1,
    change: 0.5,
    changePct: 4.76,
    volume: 140,
    amountWan: 14.7,
    timestamp: '20261030161458'
  }),
  quotes: async (symbols: string[]) =>
    Promise.all(symbols.map((s) => (fakeMarket.quote as (symbol: string) => Promise<unknown>)(s))),
  kline: klineMock,
  sectors: async () => ({ total: 0, items: [] }),
  sectorInfo: async () => null,
  sectorConstituents: async () => [],
  search: async () => ({ stocks: [], sectors: [] }),
  overview: async () => ({ indexes: [], breadth: null, topSectors: [], bottomSectors: [] }),
  announcements: async () => [],
  financials: async () => null
};

describe('Stock Market Data kline freq passthrough (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(MarketDataService)
      .useValue(fakeMarket)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'market_tester', passwordHash, status: 1 }));

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'market_tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;
  });

  beforeEach(() => {
    klineMock.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  /** 复现测试（修复前红）：controller 只传 2 参，freq=week 丢失、service 落默认 'day'。 */
  it('passes freq=week to service as the third argument', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519&freq=week')
      .set(auth())
      .expect(200);
    expect(klineMock).toHaveBeenCalledWith('sh600519', 250, 'week');
    expect(response.body.data.items).toHaveLength(3);
    expect(response.body.data.name).toBe('贵州茅台');
  });

  it('passes minute freqs 60min / 120min through', async () => {
    await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519&freq=60min')
      .set(auth())
      .expect(200);
    expect(klineMock).toHaveBeenLastCalledWith('sh600519', 250, '60min');

    await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519&freq=120min')
      .set(auth())
      .expect(200);
    expect(klineMock).toHaveBeenLastCalledWith('sh600519', 250, '120min');
  });

  it('passes day / month freqs through', async () => {
    await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519&freq=day')
      .set(auth())
      .expect(200);
    expect(klineMock).toHaveBeenLastCalledWith('sh600519', 250, 'day');

    await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519&freq=month&limit=100')
      .set(auth())
      .expect(200);
    expect(klineMock).toHaveBeenLastCalledWith('sh600519', 100, 'month');
  });

  it('falls back to day on invalid freq (no 400, same style as limit clamping)', async () => {
    await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519&freq=abc')
      .set(auth())
      .expect(200);
    expect(klineMock).toHaveBeenLastCalledWith('sh600519', 250, 'day');
  });

  it('defaults to day when freq is absent', async () => {
    await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519')
      .set(auth())
      .expect(200);
    expect(klineMock).toHaveBeenLastCalledWith('sh600519', 250, 'day');
  });

  it('admits tencent sector codes (qqt_) past the whitelist', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=qqt_pt01801120')
      .set(auth())
      .expect(200);
    // 正则放行（service 层对 qqt_ 抛 503 文案，fake 覆盖后返回静态数据即可验证放行链路）
    expect(klineMock).toHaveBeenCalledWith('qqt_pt01801120', 250, 'day');
    expect(response.body.data.items).toHaveLength(3);
  });

  it('returns empty payload for symbols outside the whitelist', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=notacode')
      .set(auth())
      .expect(200);
    expect(response.body.data.items).toEqual([]);
    expect(klineMock).not.toHaveBeenCalled();
  });
});
