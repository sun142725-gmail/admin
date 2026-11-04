// 策略插件化+模拟盘 e2e（sqlite :memory:，照 stock-backtest.spec.ts 全范式：
// 权限码→角色→用户→登录 + 无码角色 403；NODE_ENV=test / SEED=false，静态 DB fixture 不触网）。
// 期望值全部按方案「手工逐日推演写死」（不用实现反推）：
//   - 主阶梯 sh600519：27 根 [20×10, 11,11,12,13,9,4,4]，ma-cross 默认参数金叉 09-21/死叉 09-28，
//     DEFAULT_COST（滑点千 1/佣金万 3 最低 5/印花税万 5）下买 9000 股@11.011（现金 871.2703）、
//     卖 9000 股@3.996（清仓后现金 36806.4991）。
//   - sh600036：54 根 [20×10, 10×12, 22×6(idx32 open 5.4 制造 −10% 跌停), 2×12]，
//     金叉 idx20 → 8300 股@12.012；死叉 idx31 → 成交日开盘 5.4/前收 6=−10% ≤ −0.095 → limit_down skip；
//     再金叉 idx52 → already_holding skip——卖出被 skip 后策略不瘫痪（run2 与 run1 投影完整无 failed）。
//   - sh510300(全 10×30)+sh510500(20 根 10×6,11×6,12×8)：etf-momentum 买 idx10、真实停牌整行缺失
//     使 idx20/idx25 卖出信号 no_bar 落库且持仓行保持 9000 股。
//   - sz510600(30 根 10×10,11×5,12×5,9×10)：轮动回测买 idx10/卖 idx21，分组配对回合 1（亏损）。
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
import { StockDailyBar } from '../src/common/entities/stock-daily-bar.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { MarketDataService } from '../src/modules/stock/market/market-data.service';
import { toUtcMidnight } from '../src/modules/stock/daily-bars/daily-bars-calib.util';

const workdays = (count: number, start = '2026-08-24'): string[] => {
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

// 主阶梯（27 根，与 stock-backtest.spec.ts 同款）
const MAIN_DATES = workdays(27);
const MAIN_LADDER = [...Array(20).fill(10), 11, 11, 12, 13, 9, 4, 4];
// 跌停 skip 阶梯（54 根）
const LIMIT_DATES = workdays(54);
// 轮动/停牌 fixture 日期轴（30 根）
const ETF_DATES = workdays(30, '2026-09-01');

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

describe('Stock Strategy (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let barRepo: Repository<StockDailyBar>;
  let accessToken: string;
  let noCodeToken: string;

  const auth = (token: string = accessToken) => ({ Authorization: `Bearer ${token}` });

  const seedBar = (
    symbol: string,
    date: string,
    close: number,
    volume = 1000,
    open?: number
  ) =>
    barRepo.insert({
      symbol,
      tradeDate: toUtcMidnight(date)!,
      open: open ?? close,
      high: Math.max(open ?? close, close),
      low: Math.min(open ?? close, close),
      close,
      volume,
      amount: close * volume
    } as StockDailyBar);

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

    barRepo = moduleFixture.get<Repository<StockDailyBar>>(getRepositoryToken(StockDailyBar));

    // 主阶梯 sh600519 / 单根 sz000009 / 跌停阶梯 sh600036
    for (let i = 0; i < MAIN_DATES.length; i += 1) {
      await seedBar('sh600519', MAIN_DATES[i], MAIN_LADDER[i]);
    }
    await seedBar('sz000009', '2026-09-01', 10);
    for (let i = 0; i < LIMIT_DATES.length; i += 1) {
      // idx0..19=10；idx20..29=12；idx30..51=6（idx32 open 5.4 制造 −10% 跌停开盘）；idx52..53=12
      let close = 10;
      let open: number | undefined;
      if (i >= 20 && i <= 29) {
        close = 12;
      } else if (i >= 30 && i <= 51) {
        close = 6;
        if (i === 32) {
          open = 5.4; // 5.4/6−1 = −10% ≤ −0.095 → limit_down
        }
      } else if (i >= 52) {
        close = 12;
      }
      await seedBar('sh600036', LIMIT_DATES[i], close, 1000, open);
    }
    // sh510300 全 10×30；sh510500 前 20 根 10×6,11×6,12×8（idx20 起整行缺失=真实停牌形态）
    for (let i = 0; i < ETF_DATES.length; i += 1) {
      await seedBar('sh510300', ETF_DATES[i], 10);
      if (i < 20) {
        const close = i < 6 ? 10 : i < 12 ? 11 : 12;
        await seedBar('sh510500', ETF_DATES[i], close);
      }
    }
    // sz510600：30 根 10×10,11×5,12×5,9×10（轮动回测用）
    for (let i = 0; i < ETF_DATES.length; i += 1) {
      const close = i < 10 ? 10 : i < 15 ? 11 : i < 20 ? 12 : 9;
      await seedBar('sz510600', ETF_DATES[i], close);
    }

    // 权限构造（照 stock-backtest.spec.ts:125-149 范式）
    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const [strategyManage] = await permissionRepo.save(
      ['stock:strategy:manage'].map((code) => permissionRepo.create({ name: code, code }))
    );
    const fullRole = await roleRepo.save(
      roleRepo.create({ name: '策略全权', code: 'strategy-full', permissions: [strategyManage] })
    );
    const nobodyRole = await roleRepo.save(
      roleRepo.create({ name: '策略无码', code: 'strategy-nobody', permissions: [] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'strategy-admin', passwordHash, status: 1, roles: [fullRole] }));
    await userRepo.save(userRepo.create({ username: 'strategy-nobody', passwordHash, status: 1, roles: [nobodyRole] }));

    const login = async (username: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return response.body.data.accessToken;
    };
    accessToken = await login('strategy-admin');
    noCodeToken = await login('strategy-nobody');
  });

  afterAll(async () => {
    await app.close();
  });

  const createStrategy = async (body: Record<string, unknown>): Promise<number> => {
    const response = await request(app.getHttpServer())
      .post('/api/stock/strategy')
      .set(auth())
      .send(body)
      .expect(201);
    return response.body.data.id;
  };

  it('1. requires login and stock:strategy:manage (401 without token / 403 without code); watchlist-tags is login-only', async () => {
    await request(app.getHttpServer()).post('/api/stock/strategy').send({ name: 'x' }).expect(401);
    await request(app.getHttpServer())
      .post('/api/stock/strategy')
      .set(auth(noCodeToken))
      .send({ name: 'x', template: 'ma-cross', symbols: ['sh600519'] })
      .expect(403);
    // 登录用户组：无权限码也可访问 watchlist-tags（仅 JwtAuthGuard）
    await request(app.getHttpServer())
      .get('/api/stock/strategy/watchlist-tags?symbols=sh600519')
      .set(auth(noCodeToken))
      .expect(200);
  });

  it('2. CRUD full chain: create/list/detail/update/delete', async () => {
    const id = await createStrategy({
      name: '双均线主策略',
      template: 'ma-cross',
      params: { fastN: 5, slowN: 20 },
      symbols: ['sh600519'],
      simStartDate: '2026-08-01',
      remark: '主 fixture'
    });
    expect(id).toBeGreaterThan(0);

    const list = await request(app.getHttpServer())
      .get('/api/stock/strategy?page=1&pageSize=10&template=ma-cross&enabled=true')
      .set(auth())
      .expect(200);
    expect(list.body.data.total).toBeGreaterThanOrEqual(1);
    const item = list.body.data.items.find((row: { id: number }) => row.id === id);
    expect(item).toMatchObject({
      name: '双均线主策略',
      template: 'ma-cross',
      enabled: true,
      symbols: ['sh600519'],
      initialCash: 100000,
      simStartDate: '2026-08-01'
    });
    expect(item.account).toBeNull(); // 尚未运行
    expect(item.latestSignalCount).toBe(0);

    const detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(detail.body.data.config.name).toBe('双均线主策略');
    expect(detail.body.data.account).toBeNull();
    expect(detail.body.data.positions).toEqual([]);
    expect(detail.body.data.recentSignals).toEqual([]);

    const updated = await request(app.getHttpServer())
      .put(`/api/stock/strategy/${id}`)
      .set(auth())
      .send({ enabled: false, remark: '改备注' })
      .expect(200);
    expect(updated.body.data.id).toBe(id);
    expect(updated.body.data.warning).toContain('全量重建投影');

    // 停用后 run → 422
    await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(422);

    const removed = await request(app.getHttpServer()).delete(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(removed.body.data.id).toBe(id);
    await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(404);
  });

  it('3. validation 422s: duplicate name / illegal template / bad params / bad symbols / single-symbol multi-codes / rotation single code', async () => {
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer()).post('/api/stock/strategy').set(auth()).send(body);

    await createStrategy({ name: '重名策略', template: 'ma-cross', symbols: ['sh600519'] });
    await post({ name: '重名策略', template: 'ma-cross', symbols: ['sh600519'] }).expect(422); // 重名
    await post({ name: '非法模板', template: 'nope', symbols: ['sh600519'] }).expect(422);
    await post({ name: '参数越界', template: 'ma-cross', params: { fastN: 20, slowN: 5 }, symbols: ['sh600519'] }).expect(422);
    await post({ name: '参数白名单', template: 'ma-cross', params: { simStartDate: '2026-01-01' }, symbols: ['sh600519'] }).expect(422);
    await post({ name: '代码非法', template: 'ma-cross', symbols: ['SH600519'] }).expect(422); // 大写
    await post({ name: '单标的多数', template: 'ma-cross', symbols: ['sh600519', 'sz000001'] }).expect(422);
    await post({ name: '轮动单码', template: 'etf-momentum', symbols: ['sh510300'] }).expect(422);
    await post({ name: '缺标的', template: 'ma-cross' }).expect(422);
    await post({ name: '资金非法', template: 'ma-cross', symbols: ['sh600519'], initialCash: 0 }).expect(422);
    await post({ name: '日期非法', template: 'ma-cross', symbols: ['sh600519'], simStartDate: '2026-02-30' }).expect(422);

    // 并发创建同名恰一胜一败
    const results = await Promise.all([
      request(app.getHttpServer()).post('/api/stock/strategy').set(auth()).send({ name: '并发同名', template: 'macd', symbols: ['sh600519'] }),
      request(app.getHttpServer()).post('/api/stock/strategy').set(auth()).send({ name: '并发同名', template: 'macd', symbols: ['sh600519'] })
    ]);
    const statuses = results.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 422]);
  });

  it('4. single-symbol template backtest returns the kernel contract fields (hand-derived on the main ladder)', async () => {
    const id = await createStrategy({
      name: '回测-单标的',
      template: 'ma-cross',
      symbols: ['sh600519'],
      simStartDate: '2026-08-01'
    });
    const response = await request(app.getHttpServer())
      .post(`/api/stock/strategy/${id}/backtest`)
      .set(auth())
      .send({
        limit: 500,
        cost: { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0 },
        positionModel: { type: 'all-in' }
      })
      .expect(200);
    const data = response.body.data;
    expect(data.symbol).toBe('sh600519');
    expect(data.barsCount).toBe(27);
    expect(data.firstDate).toBe(MAIN_DATES[0]);
    expect(data.lastDate).toBe(MAIN_DATES[26]);
    // 内核契约字段逐字段写死（零成本 all-in：金叉 09-21 → 9000 股@11；死叉 09-28 → 清仓@4）
    expect(data.trades).toEqual([
      {
        signalDate: MAIN_DATES[20], signalAction: 'buy', status: 'filled', skipReason: null,
        tradeDate: MAIN_DATES[21], price: 11, filledPrice: 11, shares: 9000, gross: 99000, fee: 0,
        cashAfter: 1000, positionAfter: 9000, lastBuyTradeDate: MAIN_DATES[21]
      },
      {
        signalDate: MAIN_DATES[25], signalAction: 'sell', status: 'filled', skipReason: null,
        tradeDate: MAIN_DATES[26], price: 4, filledPrice: 4, shares: 9000, gross: 36000, fee: 0,
        cashAfter: 37000, positionAfter: 0, lastBuyTradeDate: null
      }
    ]);
    expect(data.metrics.totalReturn).toBe(-0.63);
    expect(data.metrics.tradeCount).toBe(2);
    expect(data.metrics.roundTripCount).toBe(1);
    expect(data.config.initialCash).toBe(100000);
  });

  it('5. rotation backtest: trades carry symbol, metrics use grouped pairing (hand-derived fills)', async () => {
    const id = await createStrategy({
      name: '回测-轮动',
      template: 'etf-momentum',
      params: { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
      symbols: ['sh510300', 'sz510600'],
      simStartDate: '2026-08-01'
    });
    const response = await request(app.getHttpServer())
      .post(`/api/stock/strategy/${id}/backtest`)
      .set(auth())
      .send({ limit: 500 })
      .expect(200);
    const data = response.body.data;
    expect(data.symbols).toEqual(['sh510300', 'sz510600']);
    expect(data.barsCount).toBe(30);
    expect(data.firstDate).toBe(ETF_DATES[0]);
    expect(data.lastDate).toBe(ETF_DATES[29]);
    // 手推：回退锚=窗口首日，调仓 idx0(预热不足)/5(动量 0)/10(BUY)/15(持有)/20(SELL)/25(动量 0)
    // 买 9000 股@11.011（现金 871.2703）；卖 9000 股@8.991（费 64.7352 → 现金 81725.5351，回合 −18.3% 亏损）
    const buy = data.trades.find((t: { signalAction: string }) => t.signalAction === 'buy');
    const sell = data.trades.find((t: { signalAction: string }) => t.signalAction === 'sell');
    expect(buy).toMatchObject({
      symbol: 'sz510600', status: 'filled', signalDate: ETF_DATES[10], tradeDate: ETF_DATES[11], shares: 9000
    });
    expect(buy.filledPrice).toBeCloseTo(11.011, 10);
    expect(sell).toMatchObject({
      symbol: 'sz510600', status: 'filled', signalDate: ETF_DATES[20], tradeDate: ETF_DATES[21], shares: 9000
    });
    expect(sell.filledPrice).toBeCloseTo(8.991, 10);
    expect(data.metrics.roundTripCount).toBe(1); // 分组配对口径
    expect(data.metrics.winRate).toBe(0);
    expect(data.metrics.profitLossRatio).toBe(0);
    expect(data.metrics.totalReturn).toBeCloseTo(81725.5351 / 100000 - 1, 10);
    // 组合净值点带 marketValue
    const lastPoint = data.equityCurve[data.equityCurve.length - 1];
    expect(lastPoint.marketValue).toBe(0);
    expect(lastPoint.equity).toBeCloseTo(81725.5351, 6);
    // config 回显
    expect(data.config.cost).toEqual({ commissionRate: 0.0003, minCommission: 5, stampTaxRate: 0.0005, slippageRate: 0.001 });
  });

  it('6. insufficient bars: run and backtest both 422', async () => {
    const id = await createStrategy({ name: 'bars不足', template: 'ma-cross', symbols: ['sz000009'] });
    await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(422);
    await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/backtest`).set(auth()).send({}).expect(422);
  });

  it('7. manual run projects exactly (hand-derived: 9000@11.011, final cash 36806.4991); reruns are idempotent incl. concurrent', async () => {
    const id = await createStrategy({
      name: '模拟盘主策略',
      template: 'ma-cross',
      symbols: ['sh600519'],
      simStartDate: '2026-08-01'
    });
    const run1 = await request(app.getHttpServer())
      .post(`/api/stock/strategy/${id}/run`)
      .set(auth())
      .expect(200);
    const data = run1.body.data;
    expect(data.signalsUpserted).toBe(2); // 正式段（≥2026-08-01）两条：buy 09-21 / sell 09-28
    expect(data.positionsUpdated).toBe(1);
    expect(data.replayedThrough).toBe(MAIN_DATES[26]);
    expect(data.account.lastRunStatus).toBe('ok');
    expect(data.account.cash).toBeCloseTo(36806.4991, 2);
    expect(data.account.equity).toBeCloseTo(36806.4991, 2);
    expect(data.account.marketValue).toBe(0);

    const detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(detail.body.data.config.name).toBe('模拟盘主策略');
    expect(detail.body.data.account.lastRunStatus).toBe('ok');
    // 持仓行：清仓后 flat；last_buy_date 保留为历史事实（影子账户口径）；盯市价=最近一根 bar 收盘
    expect(detail.body.data.positions).toHaveLength(1);
    const position = detail.body.data.positions[0];
    expect(position).toMatchObject({
      symbol: 'sh600519',
      status: 'flat',
      shares: 0,
      avgCost: null,
      lastBuyDate: MAIN_DATES[21], // 2026-09-22（买入成交日，清仓不清除）
      lastMarkDate: MAIN_DATES[26],
      lastPrice: 4,
      marketValue: 0,
      unrealizedPnl: null
    });
    // 信号行：DEFAULT_COST 滑点后成交价（buy 11×1.001 / sell 4×0.999），按 trade_date 降序
    const signals = detail.body.data.recentSignals;
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      tradeDate: MAIN_DATES[25], symbol: 'sh600519', action: 'sell', status: 'filled', skipReason: null, shares: 9000
    });
    expect(signals[0].filledPrice).toBeCloseTo(3.996, 10);
    expect(signals[0].fee).toBeCloseTo(28.7712, 6);
    expect(signals[1]).toMatchObject({
      tradeDate: MAIN_DATES[20], symbol: 'sh600519', action: 'buy', status: 'filled', skipReason: null, shares: 9000
    });
    expect(signals[1].filledPrice).toBeCloseTo(11.011, 10);
    expect(signals[1].fee).toBeCloseTo(29.7297, 6);

    // 同日重跑：信号行数不变（幂等）
    const run2 = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    expect(run2.body.data.signalsUpserted).toBe(2);
    const detail2 = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(detail2.body.data.recentSignals).toHaveLength(2);

    // 并发两次 run：信号行数仍不变（重入锁/幂等双兜底）
    await Promise.all([
      request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200),
      request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200)
    ]);
    const detail3 = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(detail3.body.data.recentSignals).toHaveLength(2);
    expect(detail3.body.data.positions[0].shares).toBe(0);
    expect(detail3.body.data.account.lastRunStatus).toBe('ok');
  });

  it('8. PUT narrowing sim_start_date rebuilds the whole projection with no stale rows', async () => {
    const id = await createStrategy({
      name: '收窄正式段',
      template: 'ma-cross',
      symbols: ['sh600519'],
      simStartDate: '2026-08-01'
    });
    await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    let detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(detail.body.data.recentSignals).toHaveLength(2);

    await request(app.getHttpServer())
      .put(`/api/stock/strategy/${id}`)
      .set(auth())
      .send({ simStartDate: '2026-09-26' }) // 切在 buy 09-21 与 sell 09-28 之间
      .expect(200);
    const run = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    expect(run.body.data.signalsUpserted).toBe(1); // 只有 sell 09-28 在正式段

    detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    // 全投影重建无残留：buy 09-21 行不存在（不再混排旧口径行）
    expect(detail.body.data.recentSignals).toHaveLength(1);
    expect(detail.body.data.recentSignals[0].tradeDate).toBe(MAIN_DATES[25]);
    // 经济折叠仍消费全窗口：预热段买入的后果在（清仓后现金与影子账户一致）
    expect(detail.body.data.account.cash).toBeCloseTo(36806.4991, 2);
    expect(detail.body.data.positions[0].lastBuyDate).toBe(MAIN_DATES[21]);
  });

  it('9. warmup-position case (r4): simStartDate cut while holding — warmup buy folded, not persisted', async () => {
    const id = await createStrategy({
      name: '预热段建仓',
      template: 'ma-cross',
      symbols: ['sh600519'],
      simStartDate: '2026-09-25' // 切在建仓（09-22 成交）后、清仓（09-29 成交）前
    });
    const run = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    // run 成功无 throw（折叠范围=全窗口；字面切 sim_start_date 的实现会命中 flat×sell_filled throw）
    expect(run.body.data.signalsUpserted).toBe(1); // 正式段只有 sell 09-28
    expect(run.body.data.account.lastRunStatus).toBe('ok');

    const detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    // 预热段 buy 信号不在信号表（信号 Tab 不可见）
    expect(detail.body.data.recentSignals).toHaveLength(1);
    expect(detail.body.data.recentSignals[0]).toMatchObject({ action: 'sell', status: 'filled' });
    // 正式段 sell 信号 filled 正常落库；持仓行 last_buy_date 落在预热段（早于 sim_start_date）
    expect(detail.body.data.positions[0]).toMatchObject({
      status: 'flat',
      shares: 0,
      lastBuyDate: MAIN_DATES[21]
    });
    // 账户 equity=正式段盯市值≠initial_cash（影子账户口径：预热段盈亏计入）
    expect(detail.body.data.account.equity).toBeCloseTo(36806.4991, 2);
    expect(detail.body.data.account.equity).not.toBeCloseTo(100000, 2);
  });

  it('10. suspended symbol with entirely missing bar rows: sell signals persist as skipped/no_bar, position untouched', async () => {
    const id = await createStrategy({
      name: '停牌换仓',
      template: 'etf-momentum',
      params: { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
      symbols: ['sh510300', 'sh510500'],
      simStartDate: '2026-08-01'
    });
    const run = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    // 手推：buy idx10（filled@11.011 → 9000 股，现金 871.2703）；idx20 起动量分 -Infinity 排除 →
    // 目标空仓 → SELL X 信号在 sh510500 缺行日 idx20 → no_bar（信号函数卖出后视为已空仓，idx25 无重复 sell）
    expect(run.body.data.signalsUpserted).toBe(2);
    expect(run.body.data.positionsUpdated).toBe(1); // 只有 sh510500 有信号行
    expect(run.body.data.account.cash).toBeCloseTo(871.2703, 4);
    expect(run.body.data.account.marketValue).toBeCloseTo(108000, 6); // 9000×12（sh510500 最近 bar 收盘）
    expect(run.body.data.account.equity).toBeCloseTo(108871.2703, 4);
    expect(run.body.data.replayedThrough).toBe(ETF_DATES[29]); // 基准日历最新 bar 日

    const detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    const signals = detail.body.data.recentSignals;
    expect(signals.map((row: { action: string; status: string; skipReason: string | null }) => [row.action, row.status, row.skipReason]))
      .toEqual([
        ['sell', 'skipped', 'no_bar'], // idx20（降序在首）
        ['buy', 'filled', null] // idx10
      ]);
    expect(signals[0].tradeDate).toBe(ETF_DATES[20]);
    // 持仓行不变：no_bar 不改持仓（holding 9000 股，成本均价 11.0143）
    expect(detail.body.data.positions).toHaveLength(1);
    const position = detail.body.data.positions[0];
    expect(position).toMatchObject({ symbol: 'sh510500', status: 'holding', shares: 9000, lastMarkDate: ETF_DATES[19] });
    expect(position.avgCost).toBeCloseTo(11.0143, 4);
    expect(position.marketValue).toBeCloseTo(108000, 6);
    expect(position.unrealizedPnl).toBeCloseTo(8871.2703, 4);
    // 重跑幂等
    const run2 = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    expect(run2.body.data.signalsUpserted).toBe(2);
    const detail2 = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(detail2.body.data.positions[0].shares).toBe(9000);
    expect(detail2.body.data.recentSignals).toHaveLength(2);
  });

  it('11. limit_down-skipped sell does not paralyze the strategy: position kept, next buy persisted, run2 complete', async () => {
    const id = await createStrategy({
      name: '跌停不瘫痪',
      template: 'ma-cross',
      symbols: ['sh600036'],
      simStartDate: '2026-08-01'
    });
    const run1 = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    // 手推：金叉 idx20 → 8300 股@12.012（现金 270.4901）；死叉 idx31 → 成交日开盘 5.4/前收 6=−10% → limit_down skip；
    // 再金叉 idx52 → already_holding skip
    expect(run1.body.data.signalsUpserted).toBe(3);
    expect(run1.body.data.account.cash).toBeCloseTo(270.4901, 4);
    expect(run1.body.data.account.equity).toBeCloseTo(99870.4901, 4); // 270.4901 + 8300×12
    let detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    const byAction = (action: string) => detail.body.data.recentSignals.filter((row: { action: string }) => row.action === action);
    expect(byAction('buy')).toHaveLength(2);
    expect(byAction('sell')).toHaveLength(1);
    expect(byAction('sell')[0]).toMatchObject({ status: 'skipped', skipReason: 'limit_down' });
    expect(byAction('buy')[0]).toMatchObject({ status: 'skipped', skipReason: 'already_holding' }); // 降序首条=idx52
    expect(byAction('buy')[1]).toMatchObject({ status: 'filled' });
    // 持仓保持 shares>0（卖出被 skip → pending_close×sell_skipped→holding，盯市值=8300×12）
    expect(detail.body.data.positions[0]).toMatchObject({ status: 'holding', shares: 8300 });
    expect(detail.body.data.positions[0].unrealizedPnl).toBeCloseTo(-129.5099, 4);

    // run2 与 run1 投影均完整：无 throw、无 failed
    const run2 = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    expect(run2.body.data.signalsUpserted).toBe(3);
    expect(run2.body.data.account.lastRunStatus).toBe('ok');
    detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
    expect(detail.body.data.positions[0].shares).toBe(8300);
    expect(detail.body.data.recentSignals).toHaveLength(3);
  });

  it('12. replay window exceeding STOCK_STRATEGY_MAX_BARS records failed via accounts.last_run_error (no silent truncation)', async () => {
    const id = await createStrategy({
      name: '窗口超限',
      template: 'ma-cross',
      symbols: ['sh600519'],
      simStartDate: '2026-08-01'
    });
    process.env.STOCK_STRATEGY_MAX_BARS = '10';
    try {
      const run = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
      // 窗口超限由 accounts.last_run_error 承载（非 422）：27 根 > 10 → failed，投影保持空
      expect(run.body.data.account.lastRunStatus).toBe('failed');
      expect(run.body.data.account.lastRunError).toContain('STOCK_STRATEGY_MAX_BARS');
      expect(run.body.data.replayedThrough).toBeNull();
      const detail = await request(app.getHttpServer()).get(`/api/stock/strategy/${id}`).set(auth()).expect(200);
      expect(detail.body.data.recentSignals).toEqual([]);
      expect(detail.body.data.positions).toEqual([]);
    } finally {
      delete process.env.STOCK_STRATEGY_MAX_BARS;
    }
    // 上限恢复后重跑成功
    const run = await request(app.getHttpServer()).post(`/api/stock/strategy/${id}/run`).set(auth()).expect(200);
    expect(run.body.data.account.lastRunStatus).toBe('ok');
    expect(run.body.data.signalsUpserted).toBe(2);
  });
});
