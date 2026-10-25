// Stock Roundtable 模块测试：mock 行情数据源，验证发起会议 → SSE 事件流 → 落库 → 历史列表的完整链路。
// 测试库无 AI 模型渠道，专家全部走本地规则兜底（与生产降级路径一致）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { MarketDataService } from '../src/modules/stock/market/market-data.service';
import { KlineItem } from '../src/modules/stock/indicators.util';

// 确定性 K 线：前 40 日下跌、其后上行，让规则信号产生可断言的多头结构。
function fakeKlines(count = 150): KlineItem[] {
  const items: KlineItem[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    const drift = i < 40 ? -0.5 : 0.7;
    const close = Math.round((price + drift + Math.sin(i / 3) * 0.5) * 100) / 100;
    items.push({
      date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      open: price,
      close,
      high: Math.max(price, close) + 0.4,
      low: Math.min(price, close) - 0.4,
      volume: 10000 + (i % 5) * 700 + (i > 40 ? 2500 : 0),
      amount: close * 10000,
      pct: ((close - price) / price) * 100
    });
    price = close;
  }
  return items;
}

const fakeMarket = {
  quote: async (symbol: string) => ({
    symbol,
    code: symbol.slice(2),
    name: symbol === 'sh600519' ? '贵州茅台' : symbol === 'sh000001' ? '上证指数' : symbol,
    price: 1335,
    prevClose: 1318.49,
    open: 1311.84,
    high: 1343.88,
    low: 1310,
    change: 16.51,
    changePct: 1.25,
    volume: 57686,
    amountWan: 767722,
    turnover: 0.46,
    pe: 20.49,
    pb: 6.64,
    amplitude: 2.57,
    floatMarketCap: 16688.59,
    totalMarketCap: 16688.59,
    timestamp: '20261023161458'
  }),
  quotes: async (symbols: string[]) =>
    Promise.all(symbols.map((s) => (fakeMarket.quote as (symbol: string) => Promise<unknown>)(s))),
  kline: async () => ({ name: '贵州茅台', items: fakeKlines(150) }),
  sectors: async () => ({
    total: 1,
    items: [
      {
        code: 'BK0475',
        name: '银行',
        pct: 1.2,
        upCount: 30,
        downCount: 10,
        leaderName: '招商银行',
        leaderCode: '600036',
        leaderPct: 3.2
      }
    ]
  }),
  sectorInfo: async () => ({ code: 'BK0475', name: '银行', pct: 1.2, upCount: 30, downCount: 10, leaderName: '招商银行' }),
  sectorConstituents: async () => [{ code: '600036', name: '招商银行', pct: 3.2 }],
  search: async (keyword: string) => ({
    stocks: keyword ? [{ symbol: 'sh600519', code: '600519', name: '贵州茅台', type: 'stock' }] : [],
    sectors: []
  }),
  overview: async () => ({
    indexes: [
      { symbol: 'sh000001', name: '上证指数', price: 3690.48, changePct: 0.89 },
      { symbol: 'sz399001', name: '深证成指', price: 12000, changePct: -0.3 },
      { symbol: 'sz399006', name: '创业板指', price: 2500, changePct: 0.5 }
    ],
    breadth: { up: 2800, down: 2100, approximate: true },
    topSectors: [{ code: 'BK0475', name: '银行', pct: 1.2 }],
    bottomSectors: [{ code: 'BK0998', name: '半导体', pct: -2.1 }]
  }),
  announcements: async () => [{ title: '2026年半年度报告', date: '2026-10-20' }],
  financials: async () => ({ eps: 35.57, revenueYi: 922.78, revenueYoy: 1.3, grossMargin: 89.56, roe: 16.75, peDynamic: 18.74 })
};

describe('Stock Roundtable (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let accessToken: string;
  let createdId: number;
  let streamRaw = '';

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
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'stock-tester', passwordHash, status: 1 }));

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'stock-tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should expose market search / quote / kline endpoints', async () => {
    const search = await request(app.getHttpServer())
      .get(`/api/stock/market/search?keyword=${encodeURIComponent('茅台')}`)
      .set(auth())
      .expect(200);
    expect(search.body.data.stocks[0].symbol).toBe('sh600519');

    const quote = await request(app.getHttpServer())
      .get('/api/stock/market/quote?symbols=sh600519')
      .set(auth())
      .expect(200);
    expect(quote.body.data[0].name).toBe('贵州茅台');

    const kline = await request(app.getHttpServer())
      .get('/api/stock/market/kline?symbol=sh600519')
      .set(auth())
      .expect(200);
    expect(kline.body.data.items.length).toBeGreaterThan(50);
    expect(kline.body.data.indicators.ma5).toBeDefined();
  });

  it('should reject invalid subject', async () => {
    await request(app.getHttpServer())
      .post('/api/stock/roundtable')
      .set(auth())
      .send({ subjectType: 'unknown' })
      .expect(422); // 项目约定：BadRequest 统一映射为 422

    await request(app.getHttpServer())
      .post('/api/stock/roundtable')
      .set(auth())
      .send({ subjectType: 'stock', symbol: '' })
      .expect(422);
  });

  it('should create roundtable and stream full session via SSE', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/stock/roundtable')
      .set(auth())
      .send({ subjectType: 'stock', symbol: 'sh600519', mode: 'quick', question: '下周能加仓吗' })
      .expect(201);
    createdId = created.body.data.id;
    expect(createdId).toBeDefined();

    await request(app.getHttpServer())
      .get(`/api/stock/roundtable/${createdId}/stream`)
      .set(auth())
      .expect(200)
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk: Buffer) => {
          streamRaw += chunk.toString();
        });
        res.on('end', () => callback(null, streamRaw));
      });

    for (const event of [
      'event: stage',
      'event: brief',
      'event: expert_start',
      'event: chunk',
      'event: expert_done',
      'event: vote',
      'event: summary_chunk',
      'event: summary_done',
      'event: done'
    ]) {
      expect(streamRaw).toContain(event);
    }
    // 五位专家在 quick 模式下都应有立场。
    const stanceCount = (streamRaw.match(/event: expert_done/g) ?? []).length;
    expect(stanceCount).toBe(5);
  });

  it('should persist turns, summary and consensus', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/stock/roundtable/${createdId}`)
      .set(auth())
      .expect(200);
    const data = detail.body.data;
    expect(data.status).toBe('completed');
    expect(data.subjectName).toBe('贵州茅台');
    expect(data.summaryText).toContain('【结论】');
    expect(data.summaryText).toContain('免责声明');
    expect(data.turns).toHaveLength(5);
    expect(data.turns[0].stance).toBeTruthy();
    expect(data.consensus.conclusion).toBeDefined();
    expect(data.consensus.votes).toMatchObject({ bull: expect.any(Number), bear: expect.any(Number), neutral: expect.any(Number) });
    expect(data.brief.snapshot.name).toBe('贵州茅台');
  });

  it('should replay completed session from db after process restart', async () => {
    // 同进程内 done 状态：走事件缓冲重放，断言事件完整。
    let raw = '';
    await request(app.getHttpServer())
      .get(`/api/stock/roundtable/${createdId}/stream`)
      .set(auth())
      .expect(200)
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => callback(null, raw));
      });
    expect(raw).toContain('event: done');
    expect(raw).toContain('event: expert_done');
  });

  it('should list sessions with consensus summary', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/stock/roundtable?page=1&pageSize=10')
      .set(auth())
      .expect(200);
    expect(list.body.data.total).toBeGreaterThanOrEqual(1);
    const item = list.body.data.items[0];
    expect(item.subjectName).toBe('贵州茅台');
    expect(item.consensus.conclusionLabel).toBeDefined();
  });

  it('should deny other user access', async () => {
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'stock-tester-2', passwordHash, status: 1 }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'stock-tester-2', password: 'password' })
      .expect(201);
    const otherAuth = { Authorization: `Bearer ${loginResponse.body.data.accessToken}` };

    await request(app.getHttpServer()).get(`/api/stock/roundtable/${createdId}`).set(otherAuth).expect(403);
    await request(app.getHttpServer()).delete(`/api/stock/roundtable/${createdId}`).set(otherAuth).expect(403);
  });

  it('should create market session and remove own record', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/stock/roundtable')
      .set(auth())
      .send({ subjectType: 'market', mode: 'quick' })
      .expect(201);
    const id = created.body.data.id;

    let raw = '';
    await request(app.getHttpServer())
      .get(`/api/stock/roundtable/${id}/stream`)
      .set(auth())
      .expect(200)
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => callback(null, raw));
      });
    expect(raw).toContain('event: done');

    await request(app.getHttpServer()).delete(`/api/stock/roundtable/${id}`).set(auth()).expect(200);
    await request(app.getHttpServer()).get(`/api/stock/roundtable/${id}`).set(auth()).expect(404);
  });
});
