// AiCanvas 模块测试：GET/PUT /ai/canvas 画布快照（只挂 JWT，同 /ai/images 口径）。
// 覆盖：未登录 401、首载 null、保存回读逐字段一致、幂等覆盖（upsert 单行）、
// 用户间隔离、并发双 PUT 仍单行（userId 唯一索引 + upsert 竞态路径）、
// >2MB 快照 422（BadRequest→422 项目口径，按 UTF-8 字节数——与前端 canvasAutosave
// keepalive 预算同口径，中文每字符 3 字节）、快照缺失/非对象/多余字段 422。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as express from 'express';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { User } from '../src/common/entities/user.entity';
import { AiCanvas } from '../src/common/entities/ai-canvas.entity';

describe('AiCanvas (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let tokenA: string;
  let tokenB: string;
  let userAId: number;
  let canvasRepo: Repository<AiCanvas>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    // 与 main.ts 引导保持一致：bodyParser: false + 手动 10mb JSON 上限（2MB 快照用例需穿透
    // body-parser 命中 service 层校验，Nest 默认 100kb 会先 413）+ 全局前缀 + 拦截器 + 校验管道。
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const passwordHash = await bcrypt.hash('password', 10);
    // 无角色用户即可：控制器只挂 JwtAuthGuard，快照为用户私有数据。
    const userA = await userRepo.save(userRepo.create({ username: 'canvas-a', passwordHash, status: 1 }));
    await userRepo.save(userRepo.create({ username: 'canvas-b', passwordHash, status: 1 }));
    userAId = userA.id;

    const login = async (username: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return res.body.data.accessToken as string;
    };
    tokenA = await login('canvas-a');
    tokenB = await login('canvas-b');

    canvasRepo = moduleFixture.get<Repository<AiCanvas>>(getRepositoryToken(AiCanvas));
  });

  afterAll(async () => {
    await app.close();
  });

  const authA = () => ({ Authorization: `Bearer ${tokenA}` });
  const authB = () => ({ Authorization: `Bearer ${tokenB}` });

  it('未携带令牌 GET/PUT 应 401（JWT 保护）', async () => {
    await request(app.getHttpServer()).get('/api/ai/canvas').expect(401);
    await request(app.getHttpServer()).put('/api/ai/canvas').send({ snapshot: {} }).expect(401);
  });

  it('首次读取：snapshot 为 null（从未保存过）', async () => {
    const res = await request(app.getHttpServer()).get('/api/ai/canvas').set(authA()).expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.snapshot).toBeNull();
  });

  it('PUT 保存后 GET 回读逐字段一致（nodes/viewport 原样往返）', async () => {
    const snapshot = {
      version: 1,
      nodes: [
        { id: 'img-1', type: 'image', position: { x: 100, y: 200 }, data: { url: '/uploads/ai-images/a.jpg', width: 240, height: 240 } },
        { id: 'note-1', type: 'note', position: { x: 0, y: 0 }, data: { text: '备忘', color: '#fff7b8' } }
      ],
      viewport: { x: -12.5, y: 33, zoom: 0.75 }
    };
    const saved = await request(app.getHttpServer())
      .put('/api/ai/canvas')
      .set(authA())
      .send({ snapshot })
      .expect(200);
    expect(saved.body.data.success).toBe(true);

    const read = await request(app.getHttpServer()).get('/api/ai/canvas').set(authA()).expect(200);
    expect(read.body.data.snapshot).toEqual(snapshot);
  });

  it('二次 PUT 覆盖：返回新值且全表仍只有该用户一行（upsert 幂等）', async () => {
    const second = { version: 1, nodes: [], viewport: { x: 1, y: 2, zoom: 1 } };
    await request(app.getHttpServer())
      .put('/api/ai/canvas')
      .set(authA())
      .send({ snapshot: second })
      .expect(200);
    const read = await request(app.getHttpServer()).get('/api/ai/canvas').set(authA()).expect(200);
    expect(read.body.data.snapshot).toEqual(second);
    expect(await canvasRepo.count({ where: { userId: userAId } })).toBe(1);
  });

  it('用户隔离：A 写入后 B 首读仍为 null', async () => {
    const readB = await request(app.getHttpServer()).get('/api/ai/canvas').set(authB()).expect(200);
    expect(readB.body.data.snapshot).toBeNull();
  });

  it('并发双 PUT（Promise.all）：两请求都成功且该用户仍仅一行', async () => {
    const snapshotOne = { version: 1, nodes: [{ id: 'p1' }], viewport: { x: 0, y: 0, zoom: 1 } };
    const snapshotTwo = { version: 1, nodes: [{ id: 'p2' }], viewport: { x: 0, y: 0, zoom: 1 } };
    const [one, two] = await Promise.all([
      request(app.getHttpServer()).put('/api/ai/canvas').set(authB()).send({ snapshot: snapshotOne }).expect(200),
      request(app.getHttpServer()).put('/api/ai/canvas').set(authB()).send({ snapshot: snapshotTwo }).expect(200)
    ]);
    expect(one.body.data.success).toBe(true);
    expect(two.body.data.success).toBe(true);
    const rows = await canvasRepo.find({ order: { userId: 'ASC' } });
    // A 一行 + B 一行（并发覆盖后仍单行）
    expect(rows).toHaveLength(2);
    const bRow = rows.find((row) => row.userId !== userAId);
    expect([snapshotOne, snapshotTwo]).toContainEqual(bRow!.snapshot);
  });

  it('>2MB 快照应 422（BadRequest 统一映射 422 的项目口径）', async () => {
    const oversized = {
      version: 1,
      nodes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      junk: 'x'.repeat(2 * 1024 * 1024 + 1024)
    };
    await request(app.getHttpServer())
      .put('/api/ai/canvas')
      .set(authA())
      .send({ snapshot: oversized })
      .expect(422);
  });

  it('上限内 ASCII 快照应 200（字节口径未把正常大快照一刀切掉）', async () => {
    const bounded = {
      version: 1,
      nodes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      junk: 'x'.repeat(2 * 1024 * 1024 - 1024)
    };
    await request(app.getHttpServer())
      .put('/api/ai/canvas')
      .set(authA())
      .send({ snapshot: bounded })
      .expect(200);
  });

  it('中文快照 UTF-16 字符数未超 2M 但 UTF-8 字节超 2M：应 422（字节口径回归）', async () => {
    // '画' UTF-8 每字符 3 字节：800000 字符 → JSON.stringify().length ≈ 800058（旧字符数口径
    // 会放行），Buffer.byteLength ≈ 2.4MB > 2MB（新字节口径拒绝）。与前端 keepalive 预算
    // （canvasAutosave 按编码后字节数判定）同口径。
    const oversized = {
      version: 1,
      nodes: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      junk: '画'.repeat(800000)
    };
    expect(JSON.stringify(oversized).length).toBeLessThan(2 * 1024 * 1024);
    expect(Buffer.byteLength(JSON.stringify({ snapshot: oversized }), 'utf8')).toBeGreaterThan(
      2 * 1024 * 1024
    );
    await request(app.getHttpServer())
      .put('/api/ai/canvas')
      .set(authA())
      .send({ snapshot: oversized })
      .expect(422);
  });

  it('快照缺失 / 非对象 / 多余字段应 422（forbidNonWhitelisted 规矩）', async () => {
    // snapshot 缺失
    await request(app.getHttpServer()).put('/api/ai/canvas').set(authA()).send({}).expect(422);
    // snapshot 非对象
    await request(app.getHttpServer())
      .put('/api/ai/canvas')
      .set(authA())
      .send({ snapshot: 'not-an-object' })
      .expect(422);
    // 多余字段
    await request(app.getHttpServer())
      .put('/api/ai/canvas')
      .set(authA())
      .send({ snapshot: { version: 1 }, hacked: true })
      .expect(422);
  });
});
