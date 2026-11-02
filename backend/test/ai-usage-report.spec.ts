// 用量聚合报表 e2e：usageRepo 直插固定 fixture 纯离线，断言三维分组/金额（价格行 + 环境变量兜底两路径）、
// 筛选参数、失败记录口径（calls 计入、金额 0）与权限 403。
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
import { AiUsageLog } from '../src/common/entities/ai-usage-log.entity';
import { AiModelPrice } from '../src/common/entities/ai-model-price.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

const utc = (iso: string): Date => new Date(iso);

describe('AI Usage Report (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let otherToken: string;
  let usageRepo: Repository<AiUsageLog>;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const otherAuth = () => ({ Authorization: `Bearer ${otherToken}` });

  /** 直插用量记录：createdAt 经 update 回写（CreateDateColumn 不信任实体显式值）。 */
  const insertLog = async (log: Partial<AiUsageLog>): Promise<number> => {
    const saved = await usageRepo.save(usageRepo.create(log));
    if (log.createdAt) {
      await usageRepo.update(saved.id, { createdAt: log.createdAt });
    }
    return saved.id;
  };

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
    // 兜底价路径：image 无价格行，走环境变量默认价（单价口径=每张 0.5）。
    process.env.AI_PRICE_IMAGE = '0.5';

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

    usageRepo = moduleFixture.get<Repository<AiUsageLog>>(getRepositoryToken(AiUsageLog));
    accessToken = await createUserWithCodes('usage-tester', ['ai:usage:view']);
    otherToken = await createUserWithCodes('usage-other', ['ai:chat:use']);

    // 价格行：全局 chat 价（11-01 生效）；model 2 的 tts 价两行（10-01 旧价 0.0004 / 11-01 新价 0.0002）——
    // 按用量时间取「≤ 当天最新一行」。image 故意不建价格行 → 走 AI_PRICE_IMAGE 兜底。
    const priceRepo = app.get<Repository<AiModelPrice>>(getRepositoryToken(AiModelPrice));
    await priceRepo.save([
      priceRepo.create({
        modelId: undefined,
        kind: 'chat',
        inputPrice: '0.001',
        outputPrice: '0.002',
        unit: 'tokens_1k',
        currency: 'CNY',
        effectiveFrom: utc('2026-11-01T00:00:00.000Z')
      }),
      priceRepo.create({
        modelId: 2,
        kind: 'tts',
        inputPrice: '0',
        outputPrice: '0.0004',
        unit: 'char',
        currency: 'CNY',
        effectiveFrom: utc('2026-10-01T00:00:00.000Z')
      }),
      priceRepo.create({
        modelId: 2,
        kind: 'tts',
        inputPrice: '0',
        outputPrice: '0.0002',
        unit: 'char',
        currency: 'CNY',
        effectiveFrom: utc('2026-11-01T00:00:00.000Z')
      })
    ]);

    // 用量 fixture（模型 1=chat / 2=tts；项目 10/11；全部 UTC 正午避免日期漂移）：
    // 1) 11-01 chat 全局模型，无项目 → 1000/1000×0.001 + 2000/1000×0.002 = 0.005
    await insertLog({
      userId: 1, modelId: 1, kind: 'chat',
      promptTokens: 1000, completionTokens: 2000, totalTokens: 3000,
      status: 'ok', createdAt: utc('2026-11-01T12:00:00.000Z')
    });
    // 2) 11-01 chat 2000 token，项目 10 → 1000/1000×0.001 + 1000/1000×0.002 = 0.003
    await insertLog({
      userId: 1, modelId: 1, kind: 'chat', projectId: 10,
      promptTokens: 1000, completionTokens: 1000, totalTokens: 2000,
      status: 'ok', createdAt: utc('2026-11-01T13:00:00.000Z')
    });
    // 3) 11-01 tts 100 字符（新价 0.0002），项目 10 → 0.02
    await insertLog({
      userId: 1, modelId: 2, kind: 'tts', projectId: 10, unitCount: 100,
      status: 'ok', createdAt: utc('2026-11-01T14:00:00.000Z')
    });
    // 4) 11-02 tts 失败：unitCount=0（不计金额），calls 仍计入
    await insertLog({
      userId: 1, modelId: 2, kind: 'tts', projectId: 10, unitCount: 0,
      status: 'failed', errorMessage: '上游超时', createdAt: utc('2026-11-02T12:00:00.000Z')
    });
    // 5) 11-02 image（modelId null，未知模型桶），项目 11 → 兜底价 0.5×2 = 1.0
    await insertLog({
      userId: 1, modelId: undefined, kind: 'image', projectId: 11, unitCount: 2,
      status: 'ok', createdAt: utc('2026-11-02T13:00:00.000Z')
    });
    // 6) 11-02 chat 1000 token，项目 11 → 500/1000×0.001 + 500/1000×0.002 = 0.0015
    await insertLog({
      userId: 1, modelId: 1, kind: 'chat', projectId: 11,
      promptTokens: 500, completionTokens: 500, totalTokens: 1000,
      status: 'ok', createdAt: utc('2026-11-02T14:00:00.000Z')
    });
    // 7) 10-15 tts 100 字符（旧价 0.0004），项目 10 → 0.04（验证按用量日期取生效价）
    await insertLog({
      userId: 1, modelId: 2, kind: 'tts', projectId: 10, unitCount: 100,
      status: 'ok', createdAt: utc('2026-10-15T12:00:00.000Z')
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should aggregate by day/model/project with costs (price rows + env fallback)', async () => {
    const res = await request(app.getHttpServer()).get('/api/ai/usage/report').set(auth()).expect(200);
    const { summary, byDay, byModel, byProject } = res.body.data;

    // 汇总：calls 全部 7 条；tokens 仅 chat 计 6000（3000+2000+1000）；unitCount = 100+0+2+100。
    expect(summary.calls).toBe(7);
    expect(summary.tokens).toBe(6000);
    expect(summary.unitCount).toBe(202);
    expect(summary.uncoveredCalls).toBe(0);
    // 金额：0.005+0.003+0.02+0+1.0+0.0015+0.04 = 1.0695 CNY（价格行与兜底两路径合计）。
    expect(summary.costByCurrency.CNY).toBeCloseTo(1.0695, 6);

    // 按天：三天各一组。
    expect(byDay.map((row: { day: string }) => row.day)).toEqual(['2026-10-15', '2026-11-01', '2026-11-02']);
    expect(byDay[1].calls).toBe(3);
    expect(byDay[1].cost).toBeCloseTo(0.028, 6); // 0.005+0.003+0.02
    expect(byDay[2].cost).toBeCloseTo(1.0015, 6); // 0 + 1.0 + 0.0015

    // 按模型：modelId null 归「未知模型」桶。
    const unknown = byModel.find((row: { modelId: number | null }) => row.modelId === null);
    expect(unknown.modelName).toBe('未知模型');
    expect(unknown.calls).toBe(1);
    expect(unknown.cost).toBeCloseTo(1.0, 6); // image 兜底价 0.5×2
    const model1 = byModel.find((row: { modelId: number | null }) => row.modelId === 1);
    expect(model1.calls).toBe(3);
    expect(model1.tokens).toBe(6000);

    // 按项目：projectId null 不入 byProject。
    expect(byProject.length).toBe(2);
    const p10 = byProject.find((row: { projectId: number }) => row.projectId === 10);
    expect(p10.calls).toBe(4); // 含 11-02 的失败 tts（calls 计入、金额 0）
    expect(p10.cost).toBeCloseTo(0.063, 6); // 0.003 + 0.02 + 0 + 0.04（旧价行）
    const p11 = byProject.find((row: { projectId: number }) => row.projectId === 11);
    expect(p11.cost).toBeCloseTo(1.0015, 6);
  });

  it('should count failed records in calls but with zero cost', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ai/usage/report?kind=tts')
      .set(auth())
      .expect(200);
    const { summary, byModel } = res.body.data;
    // tts 三条：两条 ok（100+100 字符）+ 一条 failed（unitCount=0）。
    expect(summary.calls).toBe(3);
    expect(summary.unitCount).toBe(200);
    // 金额：100×0.0002 + 0 + 100×0.0004 = 0.06。
    expect(summary.costByCurrency.CNY).toBeCloseTo(0.06, 6);
    expect(summary.uncoveredCalls).toBe(0);
    expect(byModel.length).toBe(1);
    expect(byModel[0].modelId).toBe(2);
  });

  it('should filter by from/to window, modelId, projectId', async () => {
    const window = await request(app.getHttpServer())
      .get('/api/ai/usage/report?from=2026-11-01T00:00:00.000Z&to=2026-11-01T23:59:59.999Z')
      .set(auth())
      .expect(200);
    expect(window.body.data.summary.calls).toBe(3);
    expect(window.body.data.summary.costByCurrency.CNY).toBeCloseTo(0.028, 6);

    const byModel = await request(app.getHttpServer())
      .get('/api/ai/usage/report?modelId=1')
      .set(auth())
      .expect(200);
    expect(byModel.body.data.summary.calls).toBe(3);
    expect(byModel.body.data.byModel.length).toBe(1);

    const byProject = await request(app.getHttpServer())
      .get('/api/ai/usage/report?projectId=10')
      .set(auth())
      .expect(200);
    expect(byProject.body.data.summary.calls).toBe(4); // 含失败 tts
    // 筛选后只剩该项目的记录，byProject 单行。
    expect(byProject.body.data.byProject.length).toBe(1);
    expect(byProject.body.data.byProject[0].cost).toBeCloseTo(0.063, 6); // 0.003+0.02+0+0.04

    const byKind = await request(app.getHttpServer())
      .get('/api/ai/usage/report?kind=image')
      .set(auth())
      .expect(200);
    expect(byKind.body.data.summary.calls).toBe(1);
    expect(byKind.body.data.summary.costByCurrency.CNY).toBeCloseTo(1.0, 6);
  });

  it('roundtable 日志命中 chat 价目行（查价目表前 kind 归一，而非落入未覆盖）', async () => {
    // 价目表只有 chat/image/video/tts 行；roundtable 日志若不归一 chat 查价，
    // 且 env 未配 chat 兜底（本 fixture 只配 AI_PRICE_IMAGE），则只能记未覆盖。
    await insertLog({
      userId: 1, modelId: 1, kind: 'roundtable', projectId: 11,
      promptTokens: 2000, completionTokens: 0, totalTokens: 2000,
      status: 'ok', createdAt: utc('2026-11-02T15:00:00.000Z')
    });
    const res = await request(app.getHttpServer())
      .get('/api/ai/usage/report?kind=roundtable')
      .set(auth())
      .expect(200);
    const { summary } = res.body.data;
    expect(summary.calls).toBe(1);
    expect(summary.uncoveredCalls).toBe(0);
    // 命中 chat 价目行：2000/1000×0.001 + 0/1000×0.002 = 0.002。
    expect(summary.costByCurrency.CNY).toBeCloseTo(0.002, 6);
  });

  it('本地 11-02 00:00 生效的价格行不应用于本地 11-01 用量（生效时间与存储同为本地语义）', async () => {
    // fixture 时区假设与既有用例一致：用量时间取 UTC 正午，|本地 UTC 偏移|≤12 时不跨日。
    const priceRepo = app.get<Repository<AiModelPrice>>(getRepositoryToken(AiModelPrice));
    await priceRepo.save(
      priceRepo.create({
        modelId: 1,
        kind: 'chat',
        inputPrice: '0.01',
        outputPrice: '0.01',
        unit: 'tokens_1k',
        currency: 'CNY',
        // 无 Z 后缀 = 本地时区 11-02 00:00 生效；datetime 存储与读回均为本地语义。
        effectiveFrom: new Date('2026-11-02T00:00:00')
      })
    );
    const res = await request(app.getHttpServer())
      .get('/api/ai/usage/report?modelId=1')
      .set(auth())
      .expect(200);
    const { byDay } = res.body.data;
    expect(byDay.map((row: { day: string }) => row.day)).toEqual(['2026-11-01', '2026-11-02']);
    // 11-01 用量仍按全局旧价 0.001/0.002：0.005+0.003 = 0.008（若跨时区错位误用新价会得 0.08）。
    expect(byDay[0].cost).toBeCloseTo(0.008, 6);
    // 11-02 用量（chat 500/500 + roundtable 2000/0）按新价：0.01+0.02 = 0.03（证明该行确实生效）。
    expect(byDay[1].cost).toBeCloseTo(0.03, 6);
  });

  it('should deny user without ai:usage:view with 403', async () => {
    await request(app.getHttpServer()).get('/api/ai/usage/report').set(otherAuth()).expect(403);
  });
});
