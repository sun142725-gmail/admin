// Auth 模块测试覆盖登录、刷新与守卫。
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

describe('Auth (e2e)', () => {
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
      permissionRepo.create({ name: '用户列表', code: 'system:user:list' })
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: '测试角色', code: 'tester', permissions: [permission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(
      userRepo.create({ username: 'admin', passwordHash, status: 1, roles: [role] })
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('should login and return tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password' })
      .expect(201);

    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
  });

  it('should refresh token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password' });

    const refreshToken = loginResponse.body.data.refreshToken;

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(201);

    expect(refreshResponse.body.data.accessToken).toBeDefined();
  });

  it('should block refresh token for protected API', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password' });

    const refreshToken = loginResponse.body.data.refreshToken;

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);
  });
});
