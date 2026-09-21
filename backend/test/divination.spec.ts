// Divination 模块测试覆盖创建占卜、补填主题、SSE 流式解卦与历史列表。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Divination (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let accessToken: string;
  let createdId: number;

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
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'tester', passwordHash, status: 1 }));

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create divination without topic and stay in casting', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/divinations')
      .set(auth())
      .send({})
      .expect(201);

    const data = response.body.data;
    expect(data.id).toBeDefined();
    expect(data.lines).toHaveLength(6);
    expect(data.hexagramName).toBeTruthy();
    expect(data.status).toBe('casting');
    createdId = data.id;
  });

  it('should accept topic then stream interpretation via SSE', async () => {
    const patched = await request(app.getHttpServer())
      .patch(`/api/divinations/${createdId}/topic`)
      .set(auth())
      .send({ topic: '事业走向' })
      .expect(200);
    expect(patched.body.data.status).toBe('interpreting');

    let raw = '';
    await request(app.getHttpServer())
      .get(`/api/divinations/${createdId}/interpretation/stream`)
      .set(auth())
      .expect(200)
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => callback(null, raw));
      });

    expect(raw).toContain('event: chunk');
    expect(raw).toContain('event: done');

    const detail = await request(app.getHttpServer())
      .get(`/api/divinations/${createdId}`)
      .set(auth())
      .expect(200);
    expect(detail.body.data.status).toBe('completed');
    expect(detail.body.data.interpretation).toBeTruthy();
  });

  it('should list current user divination summaries', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/divinations?page=1&pageSize=10')
      .set(auth())
      .expect(200);

    expect(response.body.data.total).toBeGreaterThanOrEqual(1);
    const item = response.body.data.items[0];
    expect(item.topic).toBeDefined();
    expect(item.hexagramName).toBeDefined();
    expect(item.lines).toBeUndefined();
  });

  it('should reject blank topic', async () => {
    await request(app.getHttpServer())
      .patch(`/api/divinations/${createdId}/topic`)
      .set(auth())
      .send({ topic: '   ' })
      .expect(422); // 项目约定：BadRequest 统一映射为 422
  });

  it('should deny other user access to divination record', async () => {
    // 创建第二个用户，尝试访问 tester 的记录。
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'tester2', passwordHash, status: 1 }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester2', password: 'password' })
      .expect(201);
    const otherAuth = { Authorization: `Bearer ${loginResponse.body.data.accessToken}` };

    await request(app.getHttpServer())
      .get(`/api/divinations/${createdId}`)
      .set(otherAuth)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/divinations/${createdId}`)
      .set(otherAuth)
      .expect(403);
  });

  it('should remove own divination', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/divinations')
      .set(auth())
      .send({})
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer()).delete(`/api/divinations/${id}`).set(auth()).expect(200);

    await request(app.getHttpServer()).get(`/api/divinations/${id}`).set(auth()).expect(404);
  });
});
