// 自选股 e2e：收藏增删查 + 选股器自选/圆桌候选池。
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
import { StockWatchlist } from '../src/common/entities/stock-watchlist.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Stock Watchlist + Screener pools (e2e)', () => {
  let app: INestApplication;
  let watchRepo: Repository<StockWatchlist>;
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
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();

    watchRepo = moduleFixture.get<Repository<StockWatchlist>>(getRepositoryToken(StockWatchlist));
    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permission = await permissionRepo.save(
      permissionRepo.create({ name: '股市使用', code: 'stock:roundtable:use' })
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: '股市角色', code: 'stock_user', permissions: [permission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'stock_tester', passwordHash, status: 1, roles: [role] }));

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'stock_tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should add, dedupe, list and remove watchlist items', async () => {
    await request(app.getHttpServer())
      .post('/api/stock/watchlist')
      .set(auth())
      .send({ symbol: 'sh600519', name: '贵州茅台' })
      .expect(201);

    // 重复添加幂等：仍只有一条
    await request(app.getHttpServer())
      .post('/api/stock/watchlist')
      .set(auth())
      .send({ symbol: 'sh600519', name: '贵州茅台' })
      .expect(201);

    // 非法代码被 DTO 拒绝
    await request(app.getHttpServer())
      .post('/api/stock/watchlist')
      .set(auth())
      .send({ symbol: 'bogus', name: 'x' })
      .expect(422);

    const listResponse = await request(app.getHttpServer())
      .get('/api/stock/watchlist')
      .set(auth())
      .expect(200);
    expect(listResponse.body.data.items).toHaveLength(1);
    expect(listResponse.body.data.items[0].symbol).toBe('sh600519');

    await request(app.getHttpServer()).delete('/api/stock/watchlist/sh600519').set(auth()).expect(200);
    const emptyResponse = await request(app.getHttpServer()).get('/api/stock/watchlist').set(auth()).expect(200);
    expect(emptyResponse.body.data.items).toHaveLength(0);
  });

  it('should scan watchlist pool (empty pool returns empty matches)', async () => {
    // 直接在库里塞一条自选（绕过外部行情扫描的不稳定性：用真实代码但验证池路由而非命中结果）
    await watchRepo.save(watchRepo.create({ userId: 1, symbol: 'sh600519', name: '贵州茅台' }));
    // 清掉，避免真实 K 线扫描依赖网络
    await watchRepo.clear();

    const response = await request(app.getHttpServer())
      .post('/api/stock/screener/scan')
      .set(auth())
      .send({ pool: 'watchlist', freqs: ['day'], indicators: ['kdj'], status: 'golden' })
      .expect(201);
    expect(response.body.data.universe).toBe('我的自选股');
    expect(response.body.data.poolSize).toBe(0);
    expect(response.body.data.matches).toHaveLength(0);
  });

  it('should resolve roundtable pool from user history only', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/stock/screener/scan')
      .set(auth())
      .send({ pool: 'roundtable', freqs: ['day'], indicators: ['macd'], status: 'both' })
      .expect(201);
    expect(response.body.data.universe).toBe('圆桌分析过的股票');
    // 该用户没有圆桌历史 → 空池
    expect(response.body.data.poolSize).toBe(0);
  });
});
