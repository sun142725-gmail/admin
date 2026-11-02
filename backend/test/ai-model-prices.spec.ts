// 模型单价管理 e2e：CRUD 全链、非法 kind/unit 422、权限 403、两行不同生效时间取旧（resolvePrice 组合 DB 形态）。
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
import { AiModelPrice } from '../src/common/entities/ai-model-price.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { resolvePrice } from '../src/modules/ai/core/usage-cost.util';

describe('AI Model Prices (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let accessToken: string;
  let otherToken: string;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const otherAuth = () => ({ Authorization: `Bearer ${otherToken}` });

  const createUserWithCodes = async (username: string, codes: string[]) => {
    const roleRepo = app.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = app.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permissions = await permissionRepo.save(
      codes.map((code) => permissionRepo.create({ name: code, code }))
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: `${username}-角色`, code: `${username}-role`, permissions })
    );
    const repo = app.get<Repository<User>>(getRepositoryToken(User));
    const passwordHash = await bcrypt.hash('password', 10);
    await repo.save(repo.create({ username, passwordHash, status: 1, roles: [role] }));
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: 'password' })
      .expect(201);
    return login.body.data.accessToken as string;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

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

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    accessToken = await createUserWithCodes('price-tester', ['ai:model:manage']);
    otherToken = await createUserWithCodes('price-viewer', ['ai:chat:use']);
    expect(userRepo).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create, update, filter and remove a model price (full CRUD)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/ai/model-prices')
      .set(auth())
      .send({
        modelId: 7,
        kind: 'chat',
        inputPrice: 0.001,
        outputPrice: 0.002,
        currency: 'CNY',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        remark: 'DeepSeek 早期价'
      })
      .expect(201);
    const id = created.body.data.id;
    // unit 缺省按 kind 决定；decimal 读出为 number。
    expect(created.body.data.unit).toBe('tokens_1k');
    expect(typeof created.body.data.inputPrice).toBe('number');
    expect(created.body.data.inputPrice).toBe(0.001);

    const updated = await request(app.getHttpServer())
      .put(`/api/ai/model-prices/${id}`)
      .set(auth())
      .send({ outputPrice: 0.004, remark: '调价后' })
      .expect(200);
    expect(updated.body.data.outputPrice).toBe(0.004);
    expect(updated.body.data.remark).toBe('调价后');

    // 再建一行全局价用于筛选断言。
    await request(app.getHttpServer())
      .post('/api/ai/model-prices')
      .set(auth())
      .send({ kind: 'image', outputPrice: 0.5, effectiveFrom: '2026-01-01T00:00:00.000Z' })
      .expect(201);

    const byModel = await request(app.getHttpServer())
      .get('/api/ai/model-prices?modelId=7')
      .set(auth())
      .expect(200);
    expect(byModel.body.data.length).toBe(1);
    expect(byModel.body.data[0].kind).toBe('chat');

    const byKind = await request(app.getHttpServer())
      .get('/api/ai/model-prices?kind=image')
      .set(auth())
      .expect(200);
    expect(byKind.body.data.length).toBe(1);
    // image 缺省单位 = image。
    expect(byKind.body.data[0].unit).toBe('image');

    const removed = await request(app.getHttpServer())
      .delete(`/api/ai/model-prices/${id}`)
      .set(auth())
      .expect(200);
    expect(removed.body.data.success).toBe(true);
    const afterRemove = await request(app.getHttpServer())
      .get('/api/ai/model-prices?modelId=7')
      .set(auth())
      .expect(200);
    expect(afterRemove.body.data.length).toBe(0);
  });

  it('should reject invalid kind and unit with 422', async () => {
    await request(app.getHttpServer())
      .post('/api/ai/model-prices')
      .set(auth())
      .send({ kind: 'embedding', outputPrice: 1, effectiveFrom: '2026-01-01T00:00:00.000Z' })
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/ai/model-prices')
      .set(auth())
      .send({ kind: 'chat', unit: 'meter', outputPrice: 1, effectiveFrom: '2026-01-01T00:00:00.000Z' })
      .expect(422);

    // 生效时间必填。
    await request(app.getHttpServer())
      .post('/api/ai/model-prices')
      .set(auth())
      .send({ kind: 'chat', outputPrice: 1 })
      .expect(422);
  });

  it('should deny user without ai:model:manage with 403', async () => {
    await request(app.getHttpServer()).get('/api/ai/model-prices').set(otherAuth()).expect(403);
    await request(app.getHttpServer())
      .post('/api/ai/model-prices')
      .set(otherAuth())
      .send({ kind: 'chat', outputPrice: 1, effectiveFrom: '2026-01-01T00:00:00.000Z' })
      .expect(403);
  });

  it('should resolve the older effective row when two rows exist (DB shape + resolvePrice)', async () => {
    const priceRepo = app.get<Repository<AiModelPrice>>(getRepositoryToken(AiModelPrice));
    // 两行不同生效时间：旧价 0.01（2026-01 生效）、新价 0.02（2026-06 生效）。
    await priceRepo.save([
      priceRepo.create({
        modelId: 9,
        kind: 'chat',
        inputPrice: '0',
        outputPrice: '0.01',
        unit: 'tokens_1k',
        currency: 'CNY',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      }),
      priceRepo.create({
        modelId: 9,
        kind: 'chat',
        inputPrice: '0',
        outputPrice: '0.02',
        unit: 'tokens_1k',
        currency: 'CNY',
        effectiveFrom: new Date('2026-06-01T00:00:00.000Z')
      })
    ]);
    const rows = await priceRepo.find({ where: { modelId: 9 } });
    // 用量时间在 4 月：生效价应取旧行 0.01。
    const april = resolvePrice('chat', new Date('2026-04-15T00:00:00.000Z'), rows, undefined, 9);
    expect(april?.outputPrice).toBe(0.01);
    // 用量时间在 7 月：取新行 0.02。
    const july = resolvePrice('chat', new Date('2026-07-15T00:00:00.000Z'), rows, undefined, 9);
    expect(july?.outputPrice).toBe(0.02);
  });
});
