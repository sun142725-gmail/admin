// Dict 模块测试覆盖批量查询与管理接口。
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

describe('Dict (e2e)', () => {
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

    const permissions = await permissionRepo.save([
      permissionRepo.create({ name: '字典列表', code: 'system:dict:list' }),
      permissionRepo.create({ name: '新增字典', code: 'system:dict:create' }),
      permissionRepo.create({ name: '编辑字典', code: 'system:dict:update' }),
      permissionRepo.create({ name: '删除字典', code: 'system:dict:delete' })
    ]);
    const role = await roleRepo.save(
      roleRepo.create({ name: '字典管理员', code: 'dict_admin', permissions })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'tester', passwordHash, status: 1, roles: [role] }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create dict and batch query', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);

    const accessToken = loginResponse.body.data.accessToken;

    const createResponse = await request(app.getHttpServer())
      .post('/api/dicts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: 'user_status', name: '用户状态', status: 1 })
      .expect(201);

    const dictId = createResponse.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/dicts/${dictId}/items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ value: '1', label: '启用', status: 1 })
      .expect(201);

    const batchResponse = await request(app.getHttpServer())
      .get('/api/dicts/batch')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ codes: 'user_status', lang: 'zh-CN' })
      .expect(200);

    expect(batchResponse.body.data.user_status).toBeDefined();
  });
});
