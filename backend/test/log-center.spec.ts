// LogCenter 模块测试覆盖批量上报、查询筛选、traceId 链路聚合与保留期收敛。
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
import { FrontendLog } from '../src/common/entities/frontend-log.entity';
import { ErrorLog } from '../src/common/entities/error-log.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('LogCenter (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let roleRepo: Repository<Role>;
  let permissionRepo: Repository<Permission>;
  let frontendRepo: Repository<FrontendLog>;
  let errorRepo: Repository<ErrorLog>;

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

    // 与 main.ts 的启动行为对齐（前缀/管道/拦截器），否则路径 404、响应体未包装
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    frontendRepo = moduleFixture.get<Repository<FrontendLog>>(getRepositoryToken(FrontendLog));
    errorRepo = moduleFixture.get<Repository<ErrorLog>>(getRepositoryToken(ErrorLog));

    const permission = await permissionRepo.save(
      permissionRepo.create({ name: '日志中心', code: 'system:audit:center' })
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: '日志角色', code: 'log_viewer', permissions: [permission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'tester', passwordHash, status: 1, roles: [role] }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('should ingest events and query track logs', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);

    const accessToken = loginResponse.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/log-center/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        source: 'web',
        sessionId: 'session-test',
        events: [
          {
            type: 'track',
            payload: { pageCode: 'system_user', path: '/users' }
          }
        ]
      })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'track', page: 1, pageSize: 10 })
      .expect(200);

    expect(listResponse.body.data.items.length).toBeGreaterThan(0);
    const itemId = listResponse.body.data.items[0].id;

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/log-center/track/${itemId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailResponse.body.data.id).toBe(itemId);
  });

  it('should skip oversized events instead of rejecting the whole batch', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);
    const accessToken = loginResponse.body.data.accessToken;

    const ingestResponse = await request(app.getHttpServer())
      .post('/api/log-center/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        source: 'web',
        sessionId: 'session-test',
        events: [
          {
            type: 'frontend',
            payload: { level: 'info', message: '正常事件' }
          },
          {
            type: 'frontend',
            payload: { level: 'info', message: 'x'.repeat(5000) }
          }
        ]
      })
      .expect(201);

    expect(ingestResponse.body.data.accepted).toBe(1);
    expect(ingestResponse.body.data.skipped).toBe(1);
  });

  it('should filter logs by source', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);
    const accessToken = loginResponse.body.data.accessToken;

    // 前端 web 错误走批量上报接口
    await request(app.getHttpServer())
      .post('/api/log-center/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        source: 'web',
        sessionId: 'session-source',
        events: [
          { type: 'error', traceId: 'trace-source-web', payload: { message: 'web 错误' } }
        ]
      })
      .expect(201);

    // 服务端 5xx 由异常过滤器落库（source=server），这里直接插入等价数据
    await errorRepo.save(
      errorRepo.create({ source: 'server', traceId: 'trace-source-server', message: 'GET /api/x -> 500 服务器错误' })
    );

    const serverOnly = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'error', source: 'server', pageSize: 100 })
      .expect(200);
    expect(serverOnly.body.data.items.length).toBeGreaterThan(0);
    expect(serverOnly.body.data.items.every((item: { source?: string }) => item.source === 'server')).toBe(true);

    const webOnly = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'error', source: 'web', pageSize: 100 })
      .expect(200);
    expect(webOnly.body.data.items.some((item: { traceId?: string }) => item.traceId === 'trace-source-web')).toBe(true);
    expect(webOnly.body.data.items.every((item: { source?: string }) => item.source === 'web')).toBe(true);
  });

  it('should aggregate track/frontend/error logs by traceId', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);
    const accessToken = loginResponse.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/log-center/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        source: 'web',
        sessionId: 'session-trace',
        events: [
          { type: 'track', traceId: 'trace-e2e-1', payload: { pageCode: 'system_user', path: '/users' } },
          { type: 'frontend', traceId: 'trace-e2e-1', payload: { level: 'warn', category: 'api', message: '慢请求 GET /api/users' } },
          { type: 'error', traceId: 'trace-e2e-1', payload: { message: '业务失败 GET /api/users' } }
        ]
      })
      .expect(201);

    const traceResponse = await request(app.getHttpServer())
      .get('/api/log-center/trace/trace-e2e-1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(traceResponse.body.data.traceId).toBe('trace-e2e-1');
    expect(traceResponse.body.data.track).toHaveLength(1);
    expect(traceResponse.body.data.frontend).toHaveLength(1);
    expect(traceResponse.body.data.error).toHaveLength(1);

    const empty = await request(app.getHttpServer())
      .get('/api/log-center/trace/no-such-trace')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(empty.body.data.track).toHaveLength(0);
    expect(empty.body.data.frontend).toHaveLength(0);
    expect(empty.body.data.error).toHaveLength(0);
  });

  it('should search keyword in message or stack', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);
    const accessToken = loginResponse.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/log-center/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        source: 'web',
        sessionId: 'session-keyword',
        events: [
          {
            type: 'error',
            traceId: 'trace-kw-stack',
            payload: { message: '提交失败', stack: 'TypeError: Cannot read properties of undefined\n    at KWSTACKMARK (app.js:1:1)' }
          },
          {
            type: 'error',
            traceId: 'trace-kw-msg',
            payload: { message: 'KWMSGMARK 请求失败' }
          }
        ]
      })
      .expect(201);

    // 关键字命中 stack（旧实现只搜 message，此处为回归断言）
    const byStack = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'error', keyword: 'KWSTACKMARK', pageSize: 100 })
      .expect(200);
    expect(byStack.body.data.items.some((item: { traceId?: string }) => item.traceId === 'trace-kw-stack')).toBe(true);

    // 关键字命中 message
    const byMessage = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'error', keyword: 'KWMSGMARK', pageSize: 100 })
      .expect(200);
    expect(byMessage.body.data.items.some((item: { traceId?: string }) => item.traceId === 'trace-kw-msg')).toBe(true);
  });

  it('should aggregate overview stats', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);
    const accessToken = loginResponse.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/log-center/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        source: 'web',
        sessionId: 'session-stats',
        events: [
          { type: 'track', payload: { pageCode: 'stats_page_a', path: '/stats-a' } },
          { type: 'track', payload: { pageCode: 'stats_page_a', path: '/stats-a' } },
          { type: 'frontend', payload: { level: 'warn', category: 'api', message: '慢请求 GET /api/stats-demo' } },
          { type: 'error', payload: { message: 'STATS-ERR-MARK 上报错误' } }
        ]
      })
      .expect(201);

    const stats = await request(app.getHttpServer())
      .get('/api/log-center/stats')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ days: 7 })
      .expect(200);
    const data = stats.body.data;
    expect(data.days).toBe(7);
    // 趋势数量与窗口内写入量一致（含登录审计无关，仅校验三类日志各自 >=1）
    expect(data.pvTrend.reduce((sum: number, row: { count: number }) => sum + Number(row.count), 0)).toBeGreaterThanOrEqual(2);
    expect(data.frontendTrend.reduce((sum: number, row: { count: number }) => sum + Number(row.count), 0)).toBeGreaterThanOrEqual(1);
    expect(data.errorTrend.reduce((sum: number, row: { count: number }) => sum + Number(row.count), 0)).toBeGreaterThanOrEqual(1);
    // Top 聚合命中写入数据
    expect(data.topPages).toEqual(
      expect.arrayContaining([expect.objectContaining({ pageCode: 'stats_page_a' })])
    );
    expect(data.topSlowRequests).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: '慢请求 GET /api/stats-demo' })])
    );
    expect(
      data.topErrors.some((row: { message: string }) => row.message.includes('STATS-ERR-MARK'))
    ).toBe(true);
    // 来源分布包含 web 与 server（server 由前面用例插入）
    const sources = data.errorBySource.map((row: { source: string | null }) => row.source);
    expect(sources).toContain('web');
  });

  it('should clamp query range to retention window and expose retentionDays', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);
    const accessToken = loginResponse.body.data.accessToken;

    const saved = await frontendRepo.save(
      frontendRepo.create({ source: 'web', level: 'info', message: '过期日志' })
    );
    // 测试库为 sqlite :memory:，直接回写 created_at 模拟超过保留期的历史数据
    await frontendRepo.query('UPDATE frontend_logs SET created_at = datetime(\'now\', \'-30 days\') WHERE id = ?', [
      saved.id
    ]);

    // 默认窗口（不带 start）：查不到过期数据，响应带保留期信息
    const defaultRange = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'frontend', pageSize: 100 })
      .expect(200);
    expect(defaultRange.body.data.retentionDays).toBe(7);
    expect(defaultRange.body.data.items.every((item: { id: number }) => item.id !== saved.id)).toBe(true);

    // 显式传入早于保留窗口的 start：clamped=true，过期数据同样查不到
    const oldStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const clampedRange = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'frontend', start: oldStart, pageSize: 100 })
      .expect(200);
    expect(clampedRange.body.data.clamped).toBe(true);
    expect(clampedRange.body.data.items.every((item: { id: number }) => item.id !== saved.id)).toBe(true);

    // 窗口内的 start：不标记收敛
    const recentStart = new Date(Date.now() - 60 * 1000).toISOString();
    const normalRange = await request(app.getHttpServer())
      .get('/api/log-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ type: 'frontend', start: recentStart, pageSize: 100 })
      .expect(200);
    expect(normalRange.body.data.clamped).toBe(false);
  });
});
