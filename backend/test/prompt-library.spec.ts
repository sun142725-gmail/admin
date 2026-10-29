// PromptLibrary 模块测试：JWT 保护、参数校验、CRUD 与分类/关键字过滤、引用计数。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';

describe('PromptLibrary (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

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
    // 与 main.ts 引导保持一致：全局前缀 + 统一响应拦截器 + 校验管道
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permission = await permissionRepo.save(
      permissionRepo.create({ name: '提示词库使用', code: 'flow:run:view' })
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: '提示词用户', code: 'prompt_user', permissions: [permission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'prompter', passwordHash, status: 1, roles: [role] }));

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'prompter', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  it('未携带令牌访问列表应 401（JWT 保护）', async () => {
    await request(app.getHttpServer()).get('/api/prompt-templates').expect(401);
  });

  it('创建模板：默认引用计数 0 且响应结构统一（code=0）', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(auth())
      .send({
        name: '水彩绘本',
        category: 'illustrated',
        styleTags: '水彩,手绘',
        template: '水彩手绘绘本插画：{{content}}。柔和光线。'
      })
      .expect(201);
    expect(response.body.code).toBe(0);
    expect(response.body.data.name).toBe('水彩绘本');
    expect(response.body.data.referenceCount).toBe(0);
    expect(response.body.data.template).toContain('{{content}}');
  });

  it('非法分类应被校验拦截（422）', async () => {
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(auth())
      .send({ name: '坏分类', category: 'not-a-category', template: 'x' })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });

  it('缺失必填字段应 422（模板正文为空）', async () => {
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(auth())
      .send({ name: '缺正文', category: 'poster' })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });

  it('未知字段应 422（forbidNonWhitelisted 规矩）', async () => {
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(auth())
      .send({ name: '多余字段', category: 'anime', template: 'x', hack: true })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });

  it('列表按分类过滤且关键字模糊命中', async () => {
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(auth())
      .send({ name: '赛璐璐动漫风', category: 'anime', template: '动漫：{{content}}' })
      .expect(201);

    const byCategory = await request(app.getHttpServer())
      .get('/api/prompt-templates')
      .set(auth())
      .query({ category: 'anime' })
      .expect(200);
    expect(byCategory.body.data.length).toBeGreaterThan(0);
    for (const row of byCategory.body.data) {
      expect(row.category).toBe('anime');
    }

    const byKeyword = await request(app.getHttpServer())
      .get('/api/prompt-templates')
      .set(auth())
      .query({ keyword: '赛璐璐' })
      .expect(200);
    expect(byKeyword.body.data.some((row: { name: string }) => row.name === '赛璐璐动漫风')).toBe(true);
  });

  it('更新模板后内容生效；删除后再查应 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(auth())
      .send({ name: '待改模板', category: 'ui', template: 'UI：{{content}}' })
      .expect(201);
    const id = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/prompt-templates/${id}`)
      .set(auth())
      .send({ name: '改过的模板', category: 'ui', template: 'UI v2：{{content}}' })
      .expect(200);
    expect(updated.body.data.template).toBe('UI v2：{{content}}');

    await request(app.getHttpServer()).delete(`/api/prompt-templates/${id}`).set(auth()).expect(200);
    await request(app.getHttpServer()).get(`/api/prompt-templates/${id}`).set(auth()).expect(404);
  });

  it('内部模板接口受 X-Internal-Token 保护（fail-closed 由 InternalTokenGuard 保证）', async () => {
    // 请求时未配置 INTERNAL_API_TOKEN（本套件未注入）→ guard 拒绝
    await request(app.getHttpServer()).get('/api/internal/prompt-templates/1').expect(401);
  });
});

// ---------- 增量端点（/api/prompt-library/*，PermissionsGuard 细粒度权限）：批量同步幂等 / 筛选分页 / 统计 ----------
import { PromptTemplate } from '../src/common/entities/prompt-template.entity';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';

const hashOf = (prompt: string): string => createHash('sha256').update(prompt.trim()).digest('hex');

describe('PromptLibrary sync & stats (e2e)', () => {
  let app: INestApplication;
  let promptRepo: Repository<PromptTemplate>;
  let accessToken: string;
  let guestToken: string;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const guestAuth = () => ({ Authorization: `Bearer ${guestToken}` });

  const login = async (username: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: 'password' })
      .expect(201);
    return res.body.data.accessToken as string;
  };

  const sync = (items: Array<Record<string, unknown>>, withAuth = auth()) =>
    request(app.getHttpServer()).post('/api/prompt-library/sync').set(withAuth).send({ items });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    // 新控制器挂 PermissionsGuard：flow:prompt:view + flow:prompt:manage 两码齐备才放行。
    const permissions = await permissionRepo.save(
      ['flow:prompt:view', 'flow:prompt:manage'].map((code) => permissionRepo.create({ name: code, code }))
    );
    const role = await roleRepo.save(roleRepo.create({ name: '提示词库管理', code: 'prompt_lib', permissions }));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'prompt-admin', passwordHash, status: 1, roles: [role] }));
    // 无角色用户：PermissionsGuard every 覆盖校验必 403。
    await userRepo.save(userRepo.create({ username: 'prompt-guest', passwordHash, status: 1 }));

    accessToken = await login('prompt-admin');
    guestToken = await login('prompt-guest');

    promptRepo = moduleFixture.get<Repository<PromptTemplate>>(getRepositoryToken(PromptTemplate));
  });

  afterAll(async () => {
    await app.close();
  });

  it('无角色用户访问 sync/列表/统计一律 403', async () => {
    await sync([{ prompt: 'guest prompt' }], guestAuth()).expect(403);
    await request(app.getHttpServer()).get('/api/prompt-library').set(guestAuth()).expect(403);
    await request(app.getHttpServer()).get('/api/prompt-library/stats').set(guestAuth()).expect(403);
  });

  it('首次 sync：inserted 计数正确，prompt_hash 按 sha256(trim(prompt)) 落库', async () => {
    const result = await sync([
      { prompt: '  P1 动漫少女  ', category: 'anime', sourceTool: 'midjourney', title: '动漫一', sourceUrl: 'https://src.example/1' },
      { prompt: 'P2 动漫少年', category: 'anime', sourceTool: 'novelai', sourceModel: 'novelai-v3' },
      { prompt: 'P3 海报设计', category: 'poster', sourceTool: 'midjourney' }
    ]).expect(201);
    expect(result.body.data).toEqual({ received: 3, inserted: 3, skipped: 0 });

    const row = await promptRepo.findOne({ where: { promptHash: hashOf('P1 动漫少女') } });
    expect(row).not.toBeNull();
    expect(row!.template).toBe('P1 动漫少女'); // trim 后入库
    expect(row!.name).toBe('动漫一');
    expect(row!.source).toBe('midjourney');
    expect(row!.sourceUrl).toBe('https://src.example/1');
  });

  it('二次 sync 相同 prompt：全部 skipped（hash 查重幂等）', async () => {
    const result = await sync([
      { prompt: 'P1 动漫少女', category: 'anime', sourceTool: 'midjourney' },
      { prompt: 'P2 动漫少年', category: 'anime', sourceTool: 'novelai' },
      { prompt: 'P3 海报设计', category: 'poster', sourceTool: 'midjourney' }
    ]).expect(201);
    expect(result.body.data).toEqual({ received: 3, inserted: 0, skipped: 3 });
  });

  it('同批重复输入：一次提交 5 条相同 prompt，仅 1 条入库（查重 + 唯一索引兜底）', async () => {
    const items = [1, 2, 3, 4, 5].map(() => ({ prompt: 'P4 重复提示词', category: 'ui' }));
    const result = await sync(items).expect(201);
    expect(result.body.data).toEqual({ received: 5, inserted: 1, skipped: 4 });
    expect(await promptRepo.count({ where: { promptHash: hashOf('P4 重复提示词') } })).toBe(1);
  });

  it('sync 携带内网 imageUrl：入库成功但示例图不本地化（SSRF 防护，best-effort 保留外链）', async () => {
    // 环回地址命中 ssrf-guard 私网段判定：下载按失败处理，不写盘、不回写本地路径。
    const result = await sync([
      { prompt: 'P6 内网图提示词', category: 'ui', imageUrl: 'http://127.0.0.1:9/x.jpg' }
    ]).expect(201);
    expect(result.body.data.inserted).toBe(1);
    const row = await promptRepo.findOne({ where: { promptHash: hashOf('P6 内网图提示词') } });
    expect(row!.exampleImageUrl).toBe('http://127.0.0.1:9/x.jpg');
    expect(existsSync(join(process.cwd(), 'uploads', 'prompt-library', `${hashOf('P6 内网图提示词')}.jpg`))).toBe(false);
  });

  it('跨请求并发提交同一 prompt：仅一条入库', async () => {
    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map(() => sync([{ prompt: 'P5 并发提示词', category: 'general' }]).expect(201))
    );
    const inserted = responses.reduce((sum, res) => sum + res.body.data.inserted, 0);
    expect(inserted).toBe(1);
    expect(await promptRepo.count({ where: { promptHash: hashOf('P5 并发提示词') } })).toBe(1);
  });

  it('筛选：category / sourceTool / keyword / 分页（中文 query 需编码）', async () => {
    const byCategory = await request(app.getHttpServer())
      .get(`/api/prompt-library?category=${encodeURIComponent('anime')}`)
      .set(auth())
      .expect(200);
    expect(byCategory.body.data.total).toBe(2);

    const byTool = await request(app.getHttpServer())
      .get(`/api/prompt-library?sourceTool=${encodeURIComponent('novelai')}`)
      .set(auth())
      .expect(200);
    expect(byTool.body.data.total).toBe(1);
    expect(byTool.body.data.items[0].template).toBe('P2 动漫少年');

    // keyword 同时模糊命中 name 与 template：'P2 动漫' 命中缺省名「P2 动漫少年」。
    const byKeyword = await request(app.getHttpServer())
      .get(`/api/prompt-library?keyword=${encodeURIComponent('P2 动漫')}`)
      .set(auth())
      .expect(200);
    expect(byKeyword.body.data.total).toBe(1);

    const paged = await request(app.getHttpServer())
      .get(`/api/prompt-library?category=anime&page=1&pageSize=1`)
      .set(auth())
      .expect(200);
    expect(paged.body.data.page).toBe(1);
    expect(paged.body.data.items).toHaveLength(1);
    expect(paged.body.data.total).toBe(2);
  });

  it('stats：total 与按分类计数口径正确', async () => {
    const stats = await request(app.getHttpServer()).get('/api/prompt-library/stats').set(auth()).expect(200);
    expect(stats.body.data.total).toBe(6); // P1/P2/P3 + P4（同批去重后 1 条）+ P5（并发去重后 1 条）+ P6（内网图用例）
    const byCategory = Object.fromEntries(
      (stats.body.data.byCategory as Array<{ category: string; count: number }>).map((row) => [row.category, row.count])
    );
    expect(byCategory).toEqual({ anime: 2, poster: 1, ui: 2, general: 1 });
  });
});
