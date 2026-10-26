// 选股运行记录 + 自选股编辑 e2e：运行历史 API、命中落库读取、备注/分组更新。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { StockScreenerRun } from '../src/common/entities/stock-screener-run.entity';
import { StockScreenerHit } from '../src/common/entities/stock-screener-hit.entity';
import { StockWatchlist } from '../src/common/entities/stock-watchlist.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Screener runs + Watchlist edit (e2e)', () => {
  let app: INestApplication;
  let runRepo: Repository<StockScreenerRun>;
  let hitRepo: Repository<StockScreenerHit>;
  let watchRepo: Repository<StockWatchlist>;
  let accessToken: string;
  let userId: number;
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
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();

    runRepo = moduleFixture.get<Repository<StockScreenerRun>>(getRepositoryToken(StockScreenerRun));
    hitRepo = moduleFixture.get<Repository<StockScreenerHit>>(getRepositoryToken(StockScreenerHit));
    watchRepo = moduleFixture.get<Repository<StockWatchlist>>(getRepositoryToken(StockWatchlist));

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permission = await permissionRepo.save(
      permissionRepo.create({ name: '股市使用', code: 'stock:roundtable:use' })
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: '股市角色2', code: 'stock_user_2', permissions: [permission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    const user = await userRepo.save(
      userRepo.create({ username: 'run_tester', passwordHash, status: 1, roles: [role] })
    );
    userId = user.id;

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'run_tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should record run and hits, then expose via runs APIs', async () => {
    const run = await runRepo.save(
      runRepo.create({
        runDate: '2026-10-26',
        poolType: 'board',
        poolDesc: '创业板',
        config: JSON.stringify({ boards: ['chinext'], freqs: ['day'] }),
        status: 'completed'
      })
    );
    await hitRepo.save([
      hitRepo.create({
        runId: run.id,
        symbol: 'sz300750',
        name: '宁德时代',
        freq: 'day',
        lastClose: 238,
        pct1d: 0.17,
        signalType: 'golden',
        signalSource: 'both',
        barsAgo: 1,
        signalsJson: '{}'
      }),
      hitRepo.create({
        runId: run.id,
        symbol: 'sh600519',
        name: '贵州茅台',
        freq: 'day',
        lastClose: 1349.98,
        pct1d: 1.12,
        signalType: 'upcoming',
        signalSource: 'kdj',
        signalsJson: '{}'
      })
    ]);

    const listResponse = await request(app.getHttpServer())
      .get('/api/stock/screener/runs')
      .set(auth())
      .expect(200);
    expect(listResponse.body.data.total).toBeGreaterThanOrEqual(1);
    expect(listResponse.body.data.items[0].id).toBe(run.id);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/stock/screener/runs/${run.id}`)
      .set(auth())
      .expect(200);
    expect(detailResponse.body.data.run.poolDesc).toBe('创业板');
    // 金叉在前：宁德时代（golden/both）排在茅台（upcoming）前面
    expect(detailResponse.body.data.hits[0].symbol).toBe('sz300750');
    expect(detailResponse.body.data.hits).toHaveLength(2);

    await request(app.getHttpServer()).get('/api/stock/screener/runs/999999').set(auth()).expect(200);
    // 不存在的运行返回 null data
    const missing = await request(app.getHttpServer())
      .get('/api/stock/screener/runs/999999')
      .set(auth());
    expect(missing.body.data).toBeNull();

    await hitRepo.delete({ runId: run.id });
    await runRepo.delete({ id: run.id });
  });

  it('should reject trigger in test env (protect upstream)', async () => {
    await request(app.getHttpServer()).post('/api/stock/screener/runs/trigger').set(auth()).expect(503);
  });

  it('should update watchlist note and group', async () => {
    await request(app.getHttpServer())
      .post('/api/stock/watchlist')
      .set(auth())
      .send({ symbol: 'sh600519', name: '贵州茅台' })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/stock/watchlist/sh600519')
      .set(auth())
      .send({ note: '消费龙头，回调关注', group: '白酒' })
      .expect(200);
    const listResponse = await request(app.getHttpServer()).get('/api/stock/watchlist').set(auth()).expect(200);
    const item = listResponse.body.data.items[0];
    expect(item.note).toBe('消费龙头，回调关注');
    expect(item.group).toBe('白酒');

    // 分组置空回退默认
    await request(app.getHttpServer())
      .patch('/api/stock/watchlist/sh600519')
      .set(auth())
      .send({ group: '  ' })
      .expect(200);
    const again = await request(app.getHttpServer()).get('/api/stock/watchlist').set(auth()).expect(200);
    expect(again.body.data.items[0].group).toBe('默认');

    // 不在自选的代码返回 404
    await request(app.getHttpServer())
      .patch('/api/stock/watchlist/sz000001')
      .set(auth())
      .send({ note: 'x' })
      .expect(404);

    await watchRepo.clear();
  });
});
