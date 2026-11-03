// 股票日线行情库 e2e（sqlite :memory:，照 stock-market-data.spec.ts 的 fake MarketDataService 范式：
// 静态 KLINE fixture 不触网，fake 返回值一律带 source:'eastmoney' 以过源门禁；
// 权限构造照 compliance.spec.ts 范式：权限码→角色→用户→登录，另建无码角色验 403）。
// 用例 7 是「写前快照先于全窗口 upsert」顺序约束的回归防线：若实现把 upsert 提前于快照，
// fetched/stored 恒 ≈1、drifted 永远 false，该用例必失败。
// 用例 5-8 直调 service.backfillSymbol（不经 trigger 端点——后者 test 环境 503 照 screener.controller.ts 先例）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { StockWatchlist } from '../src/common/entities/stock-watchlist.entity';
import { StockScreenerRun } from '../src/common/entities/stock-screener-run.entity';
import { StockScreenerHit } from '../src/common/entities/stock-screener-hit.entity';
import { StockDailyBar } from '../src/common/entities/stock-daily-bar.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { MarketDataService } from '../src/modules/stock/market/market-data.service';
import { KlineItem } from '../src/modules/stock/indicators.util';
import { DailyBarsService } from '../src/modules/stock/daily-bars/daily-bars.service';
import { barsToCalendarDays, isoDay, toUtcMidnight } from '../src/modules/stock/daily-bars/daily-bars-calib.util';

// 静态日线 fixture：2026-09-01(二)~09-04(五) + 09-07(一)，连续工作日无缺口
const FIXTURE_DATES = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07'];
const baseItems = (): KlineItem[] =>
  FIXTURE_DATES.map((date, i) => ({
    date,
    open: 10 + i * 0.1 - 0.1,
    close: 10 + i * 0.1,
    high: 10 + i * 0.1 + 0.2,
    low: 10 + i * 0.1 - 0.2,
    volume: 100 + i * 10,
    amount: (10 + i * 0.1) * (100 + i * 10)
  }));

// fake kline 当前吐出的内容（用例间切换：正常 / ×0.77 除权 / 降级源）
let fixtureItems: KlineItem[] = baseItems();
let fixtureSource: 'eastmoney' | 'sina' | undefined = 'eastmoney';
const klineMock = jest.fn(async () => {
  const payload: { name: string; items: KlineItem[]; source?: 'eastmoney' | 'sina' } = {
    name: '探针股',
    items: fixtureItems
  };
  if (fixtureSource !== undefined) {
    payload.source = fixtureSource;
  }
  return payload;
});

const fakeMarket = {
  quote: async (symbol: string) => ({
    symbol,
    code: symbol.slice(2),
    name: '探针股',
    price: 10,
    prevClose: 10,
    open: 10,
    high: 10,
    low: 10,
    change: 0,
    changePct: 0,
    volume: 100,
    amountWan: 10,
    timestamp: '20261104000000'
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

describe('Stock Daily Bars library (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let barsService: DailyBarsService;
  let barRepo: Repository<StockDailyBar>;
  let watchRepo: Repository<StockWatchlist>;
  let runRepo: Repository<StockScreenerRun>;
  let hitRepo: Repository<StockScreenerHit>;
  let accessToken: string;
  let noCodeToken: string; // 无任何权限码：403

  const auth = (token: string = accessToken) => ({ Authorization: `Bearer ${token}` });

  const seedBar = (symbol: string, date: string, close: number, overrides: Partial<StockDailyBar> = {}) =>
    barRepo.insert({
      symbol,
      tradeDate: toUtcMidnight(date)!,
      open: close * 0.99,
      high: close * 1.02,
      low: close * 0.98,
      close,
      volume: 100,
      amount: close * 10000,
      ...overrides
    } as StockDailyBar);

  const todayIso = () => isoDay(new Date());
  // 与 summarizeSymbolQuality 同式的自动窗口下界（避免测试硬编码漂移）：
  // 窗口=根数→日历天保守换算（评审意见 3 单位对齐），barsToCalendarDays(250)=350 日历天
  const autoWindowCutoff = (windowDays = barsToCalendarDays(250)) => {
    const now = new Date();
    return isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - windowDays * 86400000));
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';

    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MarketDataService)
      .useValue(fakeMarket)
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    barsService = moduleFixture.get(DailyBarsService);
    barRepo = moduleFixture.get<Repository<StockDailyBar>>(getRepositoryToken(StockDailyBar));
    watchRepo = moduleFixture.get<Repository<StockWatchlist>>(getRepositoryToken(StockWatchlist));
    runRepo = moduleFixture.get<Repository<StockScreenerRun>>(getRepositoryToken(StockScreenerRun));
    hitRepo = moduleFixture.get<Repository<StockScreenerHit>>(getRepositoryToken(StockScreenerHit));

    // 权限构造（照 compliance.spec.ts：权限码→角色→用户→登录；无码角色验 403）
    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const [screenerUse] = await permissionRepo.save(
      ['stock:screener:use'].map((code) => permissionRepo.create({ name: code, code }))
    );
    const fullRole = await roleRepo.save(
      roleRepo.create({ name: '日线全权', code: 'daily-bars-full', permissions: [screenerUse] })
    );
    const nobodyRole = await roleRepo.save(
      roleRepo.create({ name: '日线无码', code: 'daily-bars-nobody', permissions: [] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'bars-admin', passwordHash, status: 1, roles: [fullRole] }));
    await userRepo.save(userRepo.create({ username: 'bars-nobody', passwordHash, status: 1, roles: [nobodyRole] }));

    const login = async (username: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return response.body.data.accessToken;
    };
    accessToken = await login('bars-admin');
    noCodeToken = await login('bars-nobody');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. requires login and stock:screener:use (401 without token / 403 without code)', async () => {
    await request(app.getHttpServer()).get('/api/stock/daily-bars/quality/overview').expect(401);
    await request(app.getHttpServer()).post('/api/stock/daily-bars/trigger').send({}).expect(401);
    await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/overview')
      .set(auth(noCodeToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/stock/daily-bars/trigger')
      .set(auth(noCodeToken))
      .send({})
      .expect(403);
  });

  it('2. quality overview returns zeroed universe on empty library', async () => {
    // 宇宙种子：自选 1 + 候选池命中 1（completed run），无任何 bar 行
    await watchRepo.insert({ userId: 999999, symbol: 'sh600519', name: '贵州茅台', group: '默认' });
    const run = await runRepo.save(
      runRepo.create({
        runDate: todayIso(),
        poolType: 'amount',
        poolDesc: '成交额 Top 1500',
        config: '{}',
        poolSize: 1,
        status: 'completed'
      })
    );
    await hitRepo.insert({ runId: run.id, symbol: 'sz300750', name: '宁德时代', freq: 'day', signalType: 'golden', signalSource: 'kdj' });

    const response = await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/overview')
      .set(auth())
      .expect(200);
    const data = response.body.data;
    expect(data.universe).toEqual({ watchlistSymbols: 1, screenerSymbols: 1, barsTotal: 0 });
    expect(data.total).toBe(2);
    expect(data.items).toHaveLength(2);
    const maotai = data.items.find((item: { symbol: string }) => item.symbol === 'sh600519');
    expect(maotai).toMatchObject({ symbol: 'sh600519', name: '贵州茅台', barCount: 0, firstDate: null, lastDate: null, staleDays: 0 });
    const catl = data.items.find((item: { symbol: string }) => item.symbol === 'sz300750');
    expect(catl).toMatchObject({ symbol: 'sz300750', name: '宁德时代', barCount: 0 });
  });

  it('3. quality overview aggregates barCount/firstDate/lastDate per symbol', async () => {
    await seedBar('sh600519', '2026-09-01', 10);
    await seedBar('sh600519', '2026-09-02', 10.1);
    await seedBar('sh600519', '2026-09-03', 10.2);

    const response = await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/overview')
      .set(auth())
      .expect(200);
    const data = response.body.data;
    expect(data.universe.barsTotal).toBe(3);
    const maotai = data.items.find((item: { symbol: string }) => item.symbol === 'sh600519');
    expect(maotai.barCount).toBe(3);
    expect(maotai.firstDate).toBe('2026-09-01');
    expect(maotai.lastDate).toBe('2026-09-03');
    // staleDays = 今天 − lastDate（UTC 日历日，同式计算避免硬编码漂移）
    const expectedStale = Math.floor(
      (toUtcMidnight(todayIso())!.getTime() - toUtcMidnight('2026-09-03')!.getTime()) / 86400000
    );
    expect(maotai.staleDays).toBe(Math.max(0, expectedStale));
  });

  it('4. quality detail reports weekday gaps (with outsideAutoWindow flag) and all four anomaly codes from seeded bad rows', async () => {
    // 老缺口（2026-01-05→01-12，跳 4 个工作日）：距今 ~300 日历天，落在换算窗口
    // barsToCalendarDays(250)=350 天之内（评审意见 3 单位对齐后）→ 正常运行日 outsideAutoWindow false，
    // 250 根窗口实际回看 ≈350+ 天够得着；断言按实现同式计算以兼容跨日运行
    await seedBar('sz300750', '2026-01-05', 10);
    await seedBar('sz300750', '2026-01-12', 10);
    // 2026-09-03→09-10 缺口（跳 4 个工作日）→ 近在窗口内
    await seedBar('sz300750', '2026-09-01', 10.4);
    await seedBar('sz300750', '2026-09-02', 10.6);
    await seedBar('sz300750', '2026-09-03', 10.9);
    await seedBar('sz300750', '2026-09-10', 11.1);
    // 四异常码 + 跳变
    await seedBar('sz300750', '2026-09-11', 11.2, { volume: 0 }); // zero_volume
    await seedBar('sz300750', '2026-09-14', 11.3, { open: 12, high: 11.1, low: 11.2 }); // high_low_inverted + oc_out_of_range
    await seedBar('sz300750', '2026-09-15', 0); // non_positive_price
    await seedBar('sz300750', '2026-09-16', 9.5, { open: 9, high: 10, low: 8.9 });
    await seedBar('sz300750', '2026-09-17', 12); // |12/9.5−1|≈26.3% 跳变

    const response = await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/detail?symbols=sz300750')
      .set(auth())
      .expect(200);
    const item = response.body.data.items[0];
    expect(item.symbol).toBe('sz300750');
    expect(item.barCount).toBe(11);
    expect(item.firstDate).toBe('2026-01-05');
    expect(item.lastDate).toBe('2026-09-17');

    // 缺口三段：老缺口 + 2026-01-12→09-01 超长段 + 09-03→09-10
    const cutoff = autoWindowCutoff();
    const gaps = item.weekdayGaps;
    expect(gaps).toHaveLength(3);
    const oldGap = gaps.find((g: { from: string }) => g.from === '2026-01-05');
    expect(oldGap.to).toBe('2026-01-12');
    expect(oldGap.skippedWeekdays).toBe(4);
    // 回归防线：若服务层退回「根数当日历天」（cutoff=today−250），~300 天前的 01-05 会被误判窗口外
    expect(oldGap.outsideAutoWindow).toBe('2026-01-05' < cutoff);
    const inWindowGap = gaps.find((g: { from: string }) => g.from === '2026-09-03');
    expect(inWindowGap.to).toBe('2026-09-10');
    expect(inWindowGap.skippedWeekdays).toBe(4);
    expect(inWindowGap.outsideAutoWindow).toBe('2026-09-03' < cutoff);
    const longGap = gaps.find((g: { from: string }) => g.from === '2026-01-12');
    expect(longGap.outsideAutoWindow).toBe('2026-01-12' < cutoff);

    // 异常码（顺序按日期升序；2026-09-14 一例叠加两码）
    expect(item.anomalies).toEqual([
      { tradeDate: '2026-09-11', codes: ['zero_volume'] },
      { tradeDate: '2026-09-14', codes: ['high_low_inverted', 'oc_out_of_range'] },
      { tradeDate: '2026-09-15', codes: ['non_positive_price'] }
    ]);

    // 跳变：9.5→12 = +26.32%（除权 seam 或脏数据标记）
    expect(item.suspiciousJumps).toEqual([{ tradeDate: '2026-09-17', pct: 26.32 }]);
  });

  it('5. backfill is idempotent: same fixture twice keeps unique rows and rewrites latest bar', async () => {
    await barRepo.delete({ symbol: 'sh600519' });
    fixtureSource = 'eastmoney';
    fixtureItems = baseItems();

    const first = await barsService.backfillSymbol('sh600519');
    expect(first).toMatchObject({ symbol: 'sh600519', fetched: 5, written: 5, skipped: false, failed: false, drifted: false });
    let rows = await barRepo.find({ where: { symbol: 'sh600519' }, order: { tradeDate: 'ASC' } });
    expect(rows).toHaveLength(5);

    // 第二次：仅最后一根收盘修正（结算更新语义），其余不变
    fixtureItems = baseItems();
    fixtureItems[4].close = 10.55;
    const second = await barsService.backfillSymbol('sh600519');
    expect(second.written).toBe(5);
    expect(second.drifted).toBe(false); // 重叠段（前 4 根）未变 → 无漂移告警
    rows = await barRepo.find({ where: { symbol: 'sh600519' }, order: { tradeDate: 'ASC' } });
    expect(rows).toHaveLength(5); // 唯一键幂等：无重复行
    expect(isoDay(rows[4].tradeDate)).toBe('2026-09-07');
    expect(Number(rows[4].close)).toBe(10.55); // 最新一根被重写修正
  });

  it('6. concurrent backfill of same symbol: no duplicates and no 500', async () => {
    await barRepo.delete({ symbol: 'sh600519' });
    fixtureSource = 'eastmoney';
    fixtureItems = baseItems();
    // Promise.all×2（放宽口径照 compliance.spec.ts：sqlite 幽灵 id 局限——只断言无重复无 500）
    const [a, b] = await Promise.all([
      barsService.backfillSymbol('sh600519'),
      barsService.backfillSymbol('sh600519')
    ]);
    // 两把都成功收敛（唯一冲突被服务层 update 重试吸收），不抛错即无 500
    expect(a.written + b.written).toBeGreaterThanOrEqual(5);
    const rows = await barRepo.find({ where: { symbol: 'sh600519' } });
    expect(rows).toHaveLength(5); // 无重复
  });

  it('7. drift detection flags ex-dividend refetch (factor≈0.77)', async () => {
    // 回归防线：快照（写前）先于全窗口 upsert——顺序错了 storedOverlap 读到的已是新口径行，drifted 恒 false
    await barRepo.delete({ symbol: 'sh600519' });
    fixtureSource = 'eastmoney';
    fixtureItems = baseItems();
    const first = await barsService.backfillSymbol('sh600519');
    expect(first.drifted).toBe(false);
    expect(first.factor).toBeNull();

    // 第二次拉取整体 ×0.77（除权重定基）
    fixtureItems = baseItems().map((item) => ({
      ...item,
      open: item.open * 0.77,
      high: item.high * 0.77,
      low: item.low * 0.77,
      close: item.close * 0.77
    }));
    const second = await barsService.backfillSymbol('sh600519');
    expect(second.drifted).toBe(true);
    expect(second.factor).toBeCloseTo(0.77, 2);
    // 仅告警不删行：仍 5 根
    const rows = await barRepo.find({ where: { symbol: 'sh600519' } });
    expect(rows).toHaveLength(5);
  });

  it('8. backfill skips persistence when kline resolves from degraded source', async () => {
    // 无 source（旧消费方路径/未标记）→ 门禁拒绝
    await barRepo.delete({ symbol: 'sz000001' });
    fixtureSource = undefined;
    fixtureItems = baseItems();
    const noSource = await barsService.backfillSymbol('sz000001');
    expect(noSource.skipped).toBe(true);
    expect(noSource.written).toBe(0);
    expect(await barRepo.count({ where: { symbol: 'sz000001' } })).toBe(0);

    // source='sina'（新浪不复权）→ 门禁拒绝
    fixtureSource = 'sina';
    const sina = await barsService.backfillSymbol('sz000001');
    expect(sina.skipped).toBe(true);
    expect(sina.source).toBe('sina');
    expect(sina.written).toBe(0);
    expect(await barRepo.count({ where: { symbol: 'sz000001' } })).toBe(0);

    // 门禁不影响正常源
    fixtureSource = 'eastmoney';
    const ok = await barsService.backfillSymbol('sz000001');
    expect(ok.skipped).toBe(false);
    expect(ok.written).toBe(5);
    expect(await barRepo.count({ where: { symbol: 'sz000001' } })).toBe(5);
  });

  it('9. trigger endpoint is disabled in test env (503)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/stock/daily-bars/trigger')
      .set(auth())
      .send({ symbols: ['sh600519'] })
      .expect(503);
    expect(response.body.code).toBe(503);
  });

  it('10. quality detail rejects malformed symbols with 422', async () => {
    // 大写（契约正则半角小写）/空串/混入非法段/全角字符 → 统一 422
    await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/detail?symbols=SH600519')
      .set(auth())
      .expect(422);
    await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/detail?symbols=')
      .set(auth())
      .expect(422);
    await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/detail?symbols=sh600519,bad001')
      .set(auth())
      .expect(422);
    await request(app.getHttpServer())
      .get('/api/stock/daily-bars/quality/detail?symbols=sh600519%2Csh600520%2Csh600521%2Csh600522%2Csh600523%2Csh600524%2Csh600525%2Csh600526%2Csh600527%2Csh600528%2Csh600529%2Csh600530%2Csh600531%2Csh600532%2Csh600533%2Csh600534%2Csh600535%2Csh600536%2Csh600537%2Csh600538%2Csh600539')
      .set(auth())
      .expect(422); // 21 个 > 上限 20
  });

  it('11. explicit symbol list bypasses the single-run cap; universe path still capped (review finding 2)', async () => {
    process.env.STOCK_BARS_MAX_PER_RUN = '1';
    try {
      fixtureSource = 'eastmoney';
      fixtureItems = baseItems();
      // 显式清单不截断：2 个标的超上限也全量执行（点名清单静默少抓是正确性意外）
      const explicit = await barsService.backfillUniverse(['sz000001', 'sh600519']);
      expect(explicit.total).toBe(2);
      expect(explicit.failed).toBe(0);
      expect(explicit.symbols.map((s) => s.symbol).sort()).toEqual(['sh600519', 'sz000001']);
      // 宇宙路径仍钳制：自选 sh600519 ∪ 候选池 sz300750 = 2 个 → 上限 1，余量下轮续跑
      const universeRun = await barsService.backfillUniverse();
      expect(universeRun.total).toBe(1);
    } finally {
      delete process.env.STOCK_BARS_MAX_PER_RUN;
    }
  });
});
