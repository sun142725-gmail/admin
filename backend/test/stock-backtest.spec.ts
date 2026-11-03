// 股票回测接口 e2e（sqlite :memory:，照 stock-daily-bars.spec.ts 全范式：
// 权限构造照 compliance.spec.ts 范式：权限码→角色→用户→登录，另建无码角色验 403；
// NODE_ENV=test / SEED=false，静态 DB fixture 不触网）。
// 主 fixture 期望值全部按方案 §4.3 手工逐日推演后写死（不用实现反推）：
//   27 根工作日阶梯（前 20 根 close=10，随后 11,11,12,13,9,4,4；o=h=l=c；volume=1000 防 suspended 全盘 skip），
//   零成本 + all-in：MA5/MA20 金叉 09-21 → 09-22 开盘 11 全仓 9000 股（现金 1000）；
//   死叉 09-28 → 09-29 开盘 4 清仓（现金 37000）。
//   metrics 断言分两档：整数闭式 toBe；非整数闭式（annualized/sharpe/turnover/calmar）以测试文件内
//   手写独立算式（由手推整数比直接代入公式，不 import 被测模块）+ toBeCloseTo(…,6)——e2e 验管线、单测验公式。
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

// e2e 主 fixture：2026-08-24(一)~09-29(二) 工作日 27 根（跨周末日历与 stock-daily-bars.spec.ts:29 同款推演法）
const MAIN_DATES = [
  '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
  '2026-08-31',
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
  '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
  '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
  '2026-09-28', '2026-09-29'
];
// 阶梯值：前 20 根（08-24~09-18）=10.0，09-21=11.0，09-22=11.0，09-23=12.0，09-24=13.0，09-25=9.0，09-28=4.0，09-29=4.0
const MAIN_LADDER = [...Array(20).fill(10), 11, 11, 12, 13, 9, 4, 4];

// 平价 fixture：12 根工作日恒 10（无 MA 交叉 → 无信号），供默认参数/limit 用例
const FLAT_DATES = [
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
  '2026-09-14', '2026-09-15', '2026-09-16'
];

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
  kline: async () => ({ name: '探针股', items: [], source: 'eastmoney' }),
  sectors: async () => ({ total: 0, items: [] }),
  sectorInfo: async () => null,
  sectorConstituents: async () => [],
  search: async () => ({ stocks: [], sectors: [] }),
  overview: async () => ({ indexes: [], breadth: null, topSectors: [], bottomSectors: [] }),
  announcements: async () => [],
  financials: async () => null
};

describe('Stock Backtest (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let barRepo: Repository<StockDailyBar>;
  let accessToken: string;
  let noCodeToken: string; // 无任何权限码：403

  const auth = (token: string = accessToken) => ({ Authorization: `Bearer ${token}` });

  const seedBar = (symbol: string, date: string, close: number, volume = 1000) =>
    barRepo.insert({
      symbol,
      tradeDate: toUtcMidnight(date)!,
      open: close,
      high: close,
      low: close,
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

    // 主 fixture（27 根阶梯）+ 平价 fixture（12 根恒 10）+ 单根 fixture（bars<2 → 422）
    for (let i = 0; i < MAIN_DATES.length; i += 1) {
      await seedBar('sh600519', MAIN_DATES[i], MAIN_LADDER[i]);
    }
    for (const date of FLAT_DATES) {
      await seedBar('sz000001', date, 10);
    }
    await seedBar('sz000009', '2026-09-01', 10);

    // 权限构造（照 stock-daily-bars.spec.ts:141-166：权限码→角色→用户→登录；无码角色验 403）
    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const [screenerUse] = await permissionRepo.save(
      ['stock:screener:use'].map((code) => permissionRepo.create({ name: code, code }))
    );
    const fullRole = await roleRepo.save(
      roleRepo.create({ name: '回测全权', code: 'backtest-full', permissions: [screenerUse] })
    );
    const nobodyRole = await roleRepo.save(
      roleRepo.create({ name: '回测无码', code: 'backtest-nobody', permissions: [] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'backtest-admin', passwordHash, status: 1, roles: [fullRole] }));
    await userRepo.save(userRepo.create({ username: 'backtest-nobody', passwordHash, status: 1, roles: [nobodyRole] }));

    const login = async (username: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return response.body.data.accessToken;
    };
    accessToken = await login('backtest-admin');
    noCodeToken = await login('backtest-nobody');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. requires login and stock:screener:use (401 without token / 403 without code)', async () => {
    await request(app.getHttpServer()).post('/api/stock/backtest/run').send({ symbol: 'sh600519' }).expect(401);
    await request(app.getHttpServer())
      .post('/api/stock/backtest/run')
      .set(auth(noCodeToken))
      .send({ symbol: 'sh600519' })
      .expect(403);
  });

  it('2. validates params with 422 (illegal symbol / non-positive cash / out-of-range / extra signals field / bars<2)', async () => {
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer()).post('/api/stock/backtest/run').set(auth()).send(body);

    await post({ symbol: 'SH600519' }).expect(422); // 大写（契约正则半角小写）
    await post({ symbol: 'ｓｈ600519' }).expect(422); // 全角
    await post({}).expect(422); // 缺 symbol
    await post({ symbol: 'sh600519', initialCash: 0 }).expect(422); // initialCash 须 >0
    await post({ symbol: 'sh600519', limit: 5 }).expect(422); // limit 下限 10
    await post({ symbol: 'sh600519', limitEps: 0.01 }).expect(422); // eps 上限 5e-3
    await post({ symbol: 'sh600519', limitUpPct: 0 }).expect(422); // (0, 0.5] 开区间不含 0
    await post({ symbol: 'sh600519', limitDownPct: 0 }).expect(422); // [-0.5, 0) 开区间不含 0
    // 防未来函数结构性防线：HTTP 不接受外部信号数组（未声明字段被 forbidNonWhitelisted 拒绝）
    await post({ symbol: 'sh600519', signals: [{ date: '2026-09-21', action: 'buy' }] }).expect(422);
    await post({ symbol: 'sz000009' }).expect(422); // 库内 bars<2（服务层 BadRequestException）
  });

  it('3. main fixture exact match: hand-derived equity curve, trades and metrics (zero cost, all-in)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/stock/backtest/run')
      .set(auth())
      .send({
        symbol: 'sh600519',
        initialCash: 100000,
        limitUpPct: 0.1,
        limitDownPct: -0.1,
        limitEps: 0.005,
        cost: { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0 },
        positionModel: { type: 'all-in' }
      })
      .expect(200);
    const data = response.body.data;

    expect(data.symbol).toBe('sh600519');
    expect(data.barsCount).toBe(27);
    expect(data.firstDate).toBe('2026-08-24');
    expect(data.lastDate).toBe('2026-09-29');

    // —— 净值序列：手工逐日推演写死（[cash, shares, close, equity]；记账时点：T 日净值已按 T+1 开盘成交结算）——
    // t0..t19（08-24~09-18）空仓现金 10 万；t20（09-21 buy 信号日）起已按 09-22 开盘 11 成交 9000 股、现金 1000；
    // t25（09-28 sell 信号日）起已按 09-29 开盘 4 清仓、现金 37000。整数价格保证 toBe 二进制精确。
    const flat: [number, number, number, number] = [100000, 0, 10, 100000];
    const holding = (close: number): [number, number, number, number] => [1000, 9000, close, 1000 + 9000 * close];
    const EXPECTED_CURVE: Array<[number, number, number, number]> = [
      flat, flat, flat, flat, flat, flat, flat, flat, flat, flat, // t0..t9
      flat, flat, flat, flat, flat, flat, flat, flat, flat, flat, // t10..t19
      holding(11), // t20 2026-09-21（信号日已结算次日开盘成交）equity=100000
      holding(11), // t21 2026-09-22 equity=100000
      holding(12), // t22 2026-09-23 equity=109000
      holding(13), // t23 2026-09-24 equity=118000（峰值）
      holding(9), // t24 2026-09-25 equity=82000
      [37000, 0, 4, 37000], // t25 2026-09-28（信号日已结算次日开盘清仓）
      [37000, 0, 4, 37000] // t26 2026-09-29
    ];
    expect(data.equityCurve).toHaveLength(27);
    data.equityCurve.forEach((pt: { date: string; cash: number; shares: number; close: number; equity: number }, i: number) => {
      expect(pt.date).toBe(MAIN_DATES[i]);
      expect(pt.cash).toBe(EXPECTED_CURVE[i][0]);
      expect(pt.shares).toBe(EXPECTED_CURVE[i][1]);
      expect(pt.close).toBe(EXPECTED_CURVE[i][2]);
      expect(pt.equity).toBe(EXPECTED_CURVE[i][3]);
    });

    // —— 交易清单：toEqual 逐字段写死（tradeDate/price 统一规则、skipReason filled=null）——
    expect(data.trades).toEqual([
      {
        signalDate: '2026-09-21',
        signalAction: 'buy',
        status: 'filled',
        skipReason: null,
        tradeDate: '2026-09-22',
        price: 11,
        filledPrice: 11,
        shares: 9000, // floor(100000/11/100)×100
        gross: 99000,
        fee: 0,
        cashAfter: 1000,
        positionAfter: 9000,
        lastBuyTradeDate: '2026-09-22'
      },
      {
        signalDate: '2026-09-28',
        signalAction: 'sell',
        status: 'filled',
        skipReason: null,
        tradeDate: '2026-09-29',
        price: 4,
        filledPrice: 4,
        shares: 9000,
        gross: 36000,
        fee: 0,
        cashAfter: 37000,
        positionAfter: 0,
        lastBuyTradeDate: null
      }
    ]);

    // —— metrics 整数闭式 toBe ——
    expect(data.metrics.totalReturn).toBe(-0.63);
    expect(data.metrics.maxDrawdown).toBe(1 - 37000 / 118000);
    expect(data.metrics.longestDrawdownDays).toBe(3); // 峰值 09-24 索引 23、末点索引 26、期末未恢复计 3
    expect(data.metrics.winRate).toBe(0);
    expect(data.metrics.profitLossRatio).toBe(0);
    expect(data.metrics.tradeCount).toBe(2); // filled 笔数
    expect(data.metrics.roundTripCount).toBe(1); // 已平仓回合数

    // —— metrics 非整数闭式：测试文件内手写独立算式（由手推整数比直接代入公式，不 import 被测模块）——
    const E = [...Array(22).fill(100000), 109000, 118000, 82000, 37000, 37000]; // 27 点手推序列
    const returns: number[] = [];
    for (let i = 1; i < E.length; i += 1) {
      returns.push(E[i] / E[i - 1] - 1); // 26 个日收益 = 22 个 0（21 前导+1 末尾）+ 4 个非零
    }
    expect(returns).toHaveLength(26);
    expect(returns.filter((r) => r === 0)).toHaveLength(22);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length); // 总体口径 ÷N
    const expectedAnnual = Math.pow(1 + (-0.63), 252 / 26) - 1;
    const expectedSharpe = (mean / std) * Math.sqrt(252);
    const expectedCalmar = expectedAnnual / (1 - 37000 / 118000);
    const expectedTurnover = 135000 / ((2583000 / 27) * (26 / 252)); // Σgross=135000；ΣE=2583000；N=26
    expect(data.metrics.annualizedReturn).toBeCloseTo(expectedAnnual, 6);
    expect(data.metrics.sharpe).toBeCloseTo(expectedSharpe, 6);
    expect(data.metrics.calmar).toBeCloseTo(expectedCalmar, 6);
    expect(data.metrics.turnover).toBeCloseTo(expectedTurnover, 6);

    // —— config 回显一致 ——
    expect(data.config).toEqual({
      initialCash: 100000,
      limitUpPct: 0.1,
      limitDownPct: -0.1,
      limitEps: 0.005,
      cost: { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0 }
    });
  });

  it('4. defaults: bare symbol request falls back to documented defaults (config echo), flat series yields zeroed metrics', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/stock/backtest/run')
      .set(auth())
      .send({ symbol: 'sz000001' })
      .expect(200);
    const data = response.body.data;
    expect(data.barsCount).toBe(12);
    expect(data.firstDate).toBe('2026-09-01');
    expect(data.lastDate).toBe('2026-09-16');
    expect(data.config).toEqual({
      initialCash: 100000,
      limitUpPct: 0.1,
      limitDownPct: -0.1,
      limitEps: 0.005,
      cost: { commissionRate: 0.0003, minCommission: 5, stampTaxRate: 0.0005, slippageRate: 0.001 }
    });
    // 恒价无交叉：无信号无成交；净值恒 100000（默认成本下零持仓零费用）
    expect(data.trades).toEqual([]);
    expect(data.equityCurve).toHaveLength(12);
    expect(data.equityCurve.every((pt: { equity: number }) => pt.equity === 100000)).toBe(true);
    expect(data.metrics).toEqual({
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      longestDrawdownDays: 0,
      sharpe: 0,
      calmar: null,
      winRate: null,
      profitLossRatio: null,
      turnover: 0,
      tradeCount: 0,
      roundTripCount: 0
    });
  });

  it('5. limit takes the last N bars from the library', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/stock/backtest/run')
      .set(auth())
      .send({ symbol: 'sz000001', limit: 10 })
      .expect(200);
    const data = response.body.data;
    expect(data.barsCount).toBe(10);
    expect(data.firstDate).toBe('2026-09-03'); // 12 根取末 10 根 → 自第 3 根起
    expect(data.lastDate).toBe('2026-09-16');
    expect(data.equityCurve).toHaveLength(10);
  });
});
