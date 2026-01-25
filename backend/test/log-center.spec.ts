// LogCenter 模块测试覆盖批量上报与查询。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';

describe('LogCenter (e2e)', () => {
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

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));

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
});
