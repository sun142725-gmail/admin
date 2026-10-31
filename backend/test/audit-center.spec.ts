// AuditCenter 模块测试覆盖审计查询与 traceId 链路注入。
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
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('AuditCenter (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let roleRepo: Repository<Role>;
  let permissionRepo: Repository<Permission>;

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

    // 与 main.ts 的启动行为对齐（前缀/管道/拦截器），否则路径 404、响应体未包装。
    // TraceMiddleware 在 AppModule.configure 注册，测试构建的 app 同样生效
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

    const permission = await permissionRepo.save(
      permissionRepo.create({ name: '日志中心', code: 'system:audit:center' })
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: '日志角色', code: 'audit_viewer', permissions: [permission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'audit_tester', passwordHash, status: 1, roles: [role] }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('should persist traceId on audit logs and filter by traceId', async () => {
    // 登录本身会写审计（auth.service → auditService.log），请求经 TraceMiddleware 建立 ALS 上下文
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'audit_tester', password: 'password' })
      .expect(201);
    const accessToken = loginResponse.body.data.accessToken;
    // 响应拦截器把 traceId 放在信封层（body.traceId），与业务数据 body.data 平级
    const traceId = loginResponse.body.traceId as string;
    expect(traceId).toBeTruthy();

    const listResponse = await request(app.getHttpServer())
      .get('/api/audit-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ page: 1, pageSize: 50 })
      .expect(200);
    const loginAudit = listResponse.body.data.items.find(
      (item: { action: string; detail: string }) =>
        item.action === 'login' && item.detail?.includes('audit_tester')
    );
    expect(loginAudit).toBeTruthy();
    // 核心断言：审计日志带上了与响应头/响应体一致的 traceId（ALS 注入生效）
    expect(loginAudit.traceId).toBe(traceId);

    // 按 traceId 反查：能命中这条审计（链路串联入口）
    const byTrace = await request(app.getHttpServer())
      .get('/api/audit-center')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ traceId, page: 1, pageSize: 50 })
      .expect(200);
    expect(byTrace.body.data.items.some((item: { id: number }) => item.id === loginAudit.id)).toBe(true);
  });
});
