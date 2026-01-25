// Divination 模块测试覆盖创建占卜与查询。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';

describe('Divination (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;

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
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'tester', passwordHash, status: 1 }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create divination', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);

    const accessToken = loginResponse.body.data.accessToken;

    const response = await request(app.getHttpServer())
      .post('/api/divinations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ topic: '测试主题' })
      .expect(201);

    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.lines).toHaveLength(6);
    expect(response.body.data.interpretation).toBeDefined();
  });
});
