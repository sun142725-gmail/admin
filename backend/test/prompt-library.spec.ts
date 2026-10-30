// PromptLibrary 模块测试：JWT + 权限码（view 读 / manage 写，与菜单/前端同口径）、参数校验、
// CRUD 与分类/关键字过滤（LIKE 通配符转义）、引用计数容错、内部接口令牌。
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
import { PromptTemplate } from '../src/common/entities/prompt-template.entity';

describe('PromptLibrary (e2e)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let managerToken: string; // flow:prompt:view + flow:prompt:manage 双码
  let viewerToken: string; // 仅 flow:prompt:view
  let guestToken: string; // 无角色
  let promptRepo: Repository<PromptTemplate>;

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
    // 与 guarded 控制器/菜单同口径：view 读、manage 写。
    const viewPermission = await permissionRepo.save(
      permissionRepo.create({ name: '提示词库查看', code: 'flow:prompt:view' })
    );
    const managePermission = await permissionRepo.save(
      permissionRepo.create({ name: '提示词库管理', code: 'flow:prompt:manage' })
    );
    const managerRole = await roleRepo.save(
      roleRepo.create({
        name: '提示词库管理',
        code: 'prompt_manager',
        permissions: [viewPermission, managePermission]
      })
    );
    const viewerRole = await roleRepo.save(
      roleRepo.create({ name: '提示词库只读', code: 'prompt_viewer', permissions: [viewPermission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(
      userRepo.create({ username: 'prompt-manager', passwordHash, status: 1, roles: [managerRole] })
    );
    await userRepo.save(
      userRepo.create({ username: 'prompter', passwordHash, status: 1, roles: [viewerRole] })
    );
    await userRepo.save(userRepo.create({ username: 'prompt-guest', passwordHash, status: 1 }));

    const login = async (username: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return res.body.data.accessToken as string;
    };
    managerToken = await login('prompt-manager');
    viewerToken = await login('prompter');
    guestToken = await login('prompt-guest');

    promptRepo = moduleFixture.get<Repository<PromptTemplate>>(getRepositoryToken(PromptTemplate));
  });

  afterAll(async () => {
    await app.close();
  });

  const manageAuth = () => ({ Authorization: `Bearer ${managerToken}` });
  const viewAuth = () => ({ Authorization: `Bearer ${viewerToken}` });
  const guestAuth = () => ({ Authorization: `Bearer ${guestToken}` });

  it('未携带令牌访问列表应 401（JWT 保护）', async () => {
    await request(app.getHttpServer()).get('/api/prompt-templates').expect(401);
  });

  it('无角色 guest 读列表应 403（修复前仅 JWT 校验返回 200）', async () => {
    await request(app.getHttpServer()).get('/api/prompt-templates').set(guestAuth()).expect(403);
  });

  it('仅有 view 权限的用户：GET 放行、POST/PATCH/DELETE 一律 403（修复前 201/200/200）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: '越权验证模板', category: 'ui', template: '越权验证：{{content}}' })
      .expect(201);
    const id = created.body.data.id;

    await request(app.getHttpServer()).get('/api/prompt-templates').set(viewAuth()).expect(200);

    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(viewAuth())
      .send({ name: '无权新建', category: 'ui', template: 'x' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/prompt-templates/${id}`)
      .set(viewAuth())
      .send({ name: '无权改' })
      .expect(403);
    await request(app.getHttpServer()).delete(`/api/prompt-templates/${id}`).set(viewAuth()).expect(403);
  });

  it('创建模板：默认引用计数 0 且响应结构统一（code=0）', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
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
      .set(manageAuth())
      .send({ name: '坏分类', category: 'not-a-category', template: 'x' })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });

  it('缺失必填字段应 422（模板正文为空）', async () => {
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: '缺正文', category: 'poster' })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });

  it('未知字段应 422（forbidNonWhitelisted 规矩）', async () => {
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: '多余字段', category: 'anime', template: 'x', hack: true })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });

  it('列表按分类过滤且关键字模糊命中', async () => {
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: '赛璐璐动漫风', category: 'anime', template: '动漫：{{content}}' })
      .expect(201);

    const byCategory = await request(app.getHttpServer())
      .get('/api/prompt-templates')
      .set(viewAuth())
      .query({ category: 'anime' })
      .expect(200);
    expect(byCategory.body.data.length).toBeGreaterThan(0);
    for (const row of byCategory.body.data) {
      expect(row.category).toBe('anime');
    }

    const byKeyword = await request(app.getHttpServer())
      .get('/api/prompt-templates')
      .set(viewAuth())
      .query({ keyword: '赛璐璐' })
      .expect(200);
    expect(byKeyword.body.data.some((row: { name: string }) => row.name === '赛璐璐动漫风')).toBe(true);
  });

  it("keyword='%' 不应命中全表（LIKE 通配符已转义）；下划线关键字精确命中字面行", async () => {
    // 修复前：LIKE '%%%%%' 等价全表通配；修复后 %/_ 均为字面量。
    const all = await request(app.getHttpServer())
      .get('/api/prompt-templates')
      .set(viewAuth())
      .expect(200);
    expect(all.body.data.length).toBeGreaterThan(0);

    const byPercent = await request(app.getHttpServer())
      .get('/api/prompt-templates')
      .set(viewAuth())
      .query({ keyword: '%' })
      .expect(200);
    expect(byPercent.body.data).toHaveLength(0);

    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: 'AB风格', category: 'poster', template: 'AB：{{content}}' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: 'A_B风格', category: 'poster', template: 'A_B：{{content}}' })
      .expect(201);
    // 修复前 '_' 通配任意单字符，'A_B' 会同时命中 'AB风格'；修复后只命中字面含下划线的行。
    const byUnderline = await request(app.getHttpServer())
      .get('/api/prompt-templates')
      .set(viewAuth())
      .query({ keyword: 'A_B' })
      .expect(200);
    expect(byUnderline.body.data).toHaveLength(1);
    expect(byUnderline.body.data[0].name).toBe('A_B风格');
  });

  it('更新模板后内容生效；删除后再查应 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: '待改模板', category: 'ui', template: 'UI：{{content}}' })
      .expect(201);
    const id = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/prompt-templates/${id}`)
      .set(manageAuth())
      .send({ name: '改过的模板', category: 'ui', template: 'UI v2：{{content}}' })
      .expect(200);
    expect(updated.body.data.template).toBe('UI v2：{{content}}');

    await request(app.getHttpServer()).delete(`/api/prompt-templates/${id}`).set(manageAuth()).expect(200);
    await request(app.getHttpServer()).get(`/api/prompt-templates/${id}`).set(manageAuth()).expect(404);
  });

  it('PATCH 仅传 name 部分字段应 200（修复前 UpdateDto 全必填报 422）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: '部分更新模板', category: 'ui', template: 'UI 原文：{{content}}' })
      .expect(201);
    const id = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/prompt-templates/${id}`)
      .set(manageAuth())
      .send({ name: '只改名' })
      .expect(200);
    expect(updated.body.data.name).toBe('只改名');
    expect(updated.body.data.template).toBe('UI 原文：{{content}}'); // 未传字段保持原值

    await request(app.getHttpServer()).delete(`/api/prompt-templates/${id}`).set(manageAuth()).expect(200);
  });

  it('内部模板接口受 X-Internal-Token 保护（fail-closed 由 InternalTokenGuard 保证）', async () => {
    // 请求时未配置 INTERNAL_API_TOKEN（本套件未注入）→ guard 拒绝
    await request(app.getHttpServer()).get('/api/internal/prompt-templates/1').expect(401);
  });

  it('recordUse 引用计数失败不影响内部读取：GET 仍 200 且无 unhandledRejection', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/prompt-templates')
      .set(manageAuth())
      .send({ name: '引用计数模板', category: 'ui', template: '计数：{{content}}' })
      .expect(201);
    const id = created.body.data.id;

    const rejections: unknown[] = [];
    const listener = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', listener);
    const incrementSpy = jest.spyOn(promptRepo, 'increment');
    incrementSpy.mockImplementationOnce(() => Promise.reject(new Error('increment down')));
    try {
      // 请求时临时注入内部令牌（guard 每次读 env；本套件其余用例保持未配置 → fail-closed 不受影响）。
      process.env.INTERNAL_API_TOKEN = 'prompt_spec_internal_token';
      const response = await request(app.getHttpServer())
        .get(`/api/internal/prompt-templates/${id}`)
        .set('X-Internal-Token', 'prompt_spec_internal_token')
        .expect(200);
      expect(response.body.data.template).toBe('计数：{{content}}');
      // 引用计数是异步 best-effort：给事件循环留出 rejected promise 的暴露窗口。
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rejections).toHaveLength(0); // 修复前：recordUse 未 catch → unhandledRejection
    } finally {
      incrementSpy.mockRestore();
      delete process.env.INTERNAL_API_TOKEN;
      process.off('unhandledRejection', listener);
    }
  });
});

// ---------- 增量端点（/api/prompt-library/*，PermissionsGuard 细粒度权限）：批量同步幂等 / 筛选分页 / 统计 ----------
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

  it("keyword='%' 为字面量不命中任何行（search 路径同口径转义）", async () => {
    const byPercent = await request(app.getHttpServer())
      .get(`/api/prompt-library?keyword=${encodeURIComponent('%')}`)
      .set(auth())
      .expect(200);
    expect(byPercent.body.data.total).toBe(0);
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
