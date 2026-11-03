// 合规检查链 e2e：词库 CRUD 全链路（VO 白名单、唯一索引重复/服务层 trim 等价词/并发兜底、
// view/manage 权限双向 403、QueryBuilder 过滤与 keyword 字面子串匹配）+ 发布前检查链
// （AIGC 红线/block/review/replace/停用词/空文案/check 权限双向/aigcDeclared 必填 422）。
// 范式照抄 test/publisher.spec.ts 的权限构造（权限码→角色→用户→登录）与状态码约定：
// 服务层 BadRequestException 经全局过滤器统一映射 422（http-exception.filter.ts 项目约定）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { ComplianceWord } from '../src/common/entities/compliance-words.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

// PermissionsGuard 是 every 语义：构造角色时须按端点分配全部所需码
// （full 角色同批挂 compliance:manage/compliance:view/publisher:manage——check 前置权限为 publisher:manage）。

describe('Compliance (e2e)', () => {
  let app: INestApplication;
  let wordRepo: Repository<ComplianceWord>;
  let accessToken: string;
  let viewerToken: string; // 仅 compliance:view：词库写 403 + check 403（无任何 publisher 码）
  let manageOnlyToken: string; // 仅 compliance:manage：词库读 403
  let publisherManageOnlyToken: string; // 仅 publisher:manage（无 publisher:view）：check 200（合法登记配置）

  const auth = (token: string = accessToken) => ({ Authorization: `Bearer ${token}` });

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

    wordRepo = moduleFixture.get<Repository<ComplianceWord>>(getRepositoryToken(ComplianceWord));
    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));

    const permissions = await permissionRepo.save(
      ['compliance:manage', 'compliance:view', 'publisher:manage'].map((code) =>
        permissionRepo.create({ name: code, code })
      )
    );
    const managePermission = permissions.find((item) => item.code === 'compliance:manage')!;
    const viewPermission = permissions.find((item) => item.code === 'compliance:view')!;
    const publisherManagePermission = permissions.find((item) => item.code === 'publisher:manage')!;

    const fullRole = await roleRepo.save(
      roleRepo.create({
        name: '合规全权',
        code: 'compliance-full',
        permissions: [managePermission, viewPermission, publisherManagePermission]
      })
    );
    const viewOnlyRole = await roleRepo.save(
      roleRepo.create({ name: '合规仅查看', code: 'compliance-view-only', permissions: [viewPermission] })
    );
    const manageOnlyRole = await roleRepo.save(
      roleRepo.create({ name: '合规仅管理', code: 'compliance-manage-only', permissions: [managePermission] })
    );
    const publisherManageOnlyRole = await roleRepo.save(
      roleRepo.create({
        name: '发布仅管理',
        code: 'compliance-publisher-manage-only',
        permissions: [publisherManagePermission]
      })
    );

    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'compliance-admin', passwordHash, status: 1, roles: [fullRole] }));
    await userRepo.save(userRepo.create({ username: 'compliance-viewer', passwordHash, status: 1, roles: [viewOnlyRole] }));
    await userRepo.save(
      userRepo.create({ username: 'compliance-manager-only', passwordHash, status: 1, roles: [manageOnlyRole] })
    );
    await userRepo.save(
      userRepo.create({
        username: 'compliance-publisher-manager-only',
        passwordHash,
        status: 1,
        roles: [publisherManageOnlyRole]
      })
    );

    const login = async (username: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return response.body.data.accessToken;
    };
    accessToken = await login('compliance-admin');
    viewerToken = await login('compliance-viewer');
    manageOnlyToken = await login('compliance-manager-only');
    publisherManageOnlyToken = await login('compliance-publisher-manager-only');
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- 词库段 ----

  it('POST 词：成功返回白名单 VO（id/word/level/status/suggestion/remark/createdAt/updatedAt）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '赌博', level: 'block', remark: '平台红线' })
      .expect(201);
    expect(created.body.data).toEqual({
      id: expect.any(Number),
      word: '赌博',
      level: 'block',
      status: 1,
      suggestion: null,
      remark: '平台红线',
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
  });

  it('顺序二次 POST 同 word → 422「该敏感词已存在」；带首尾空格的等价词（服务层 trim 后）同判 422', async () => {
    const again = await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '赌博', level: 'block' })
      .expect(422);
    expect(again.body.message).toContain('该敏感词已存在');

    // 前端 trim 仅 UX，唯一性以后端 trim 为准：' 赌博 ' 入库前 trim 撞唯一索引
    const padded = await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: ' 赌博 ', level: 'block' })
      .expect(422);
    expect(padded.body.message).toContain('该敏感词已存在');
  });

  it('并发 Promise.all 两条同 word：恰一 201、一 422、零 500（唯一索引 DB 兜底）', async () => {
    const payload = { word: '并发词', level: 'review' };
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/api/compliance/words').set(auth()).send(payload),
      request(app.getHttpServer()).post('/api/compliance/words').set(auth()).send(payload)
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 422]);
    expect(first.status).toBeLessThan(500);
    expect(second.status).toBeLessThan(500);
    // sqlite :memory: 并发 save 有幽灵 id 局限（照 publisher.spec.ts:214 口径）：只断言无重复无 500
    const rows = await wordRepo.find({ where: { word: '并发词' } });
    expect(rows.length).toBeLessThanOrEqual(1);
  });

  it('PATCH 词：改 level/status/remark 生效；改 word 撞已有词 → 422；不存在 id → 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '可改词', level: 'block' })
      .expect(201);
    const id = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/compliance/words/${id}`)
      .set(auth())
      .send({ level: 'review', status: 0, remark: '降级观察' })
      .expect(200);
    expect(updated.body.data).toMatchObject({ word: '可改词', level: 'review', status: 0, remark: '降级观察' });

    // 改 word 撞已有词（服务层 trim 后查重）→ 422
    await request(app.getHttpServer())
      .patch(`/api/compliance/words/${id}`)
      .set(auth())
      .send({ word: ' 赌博 ' })
      .expect(422);

    await request(app.getHttpServer())
      .patch('/api/compliance/words/999999')
      .set(auth())
      .send({ remark: '无此词' })
      .expect(404);
  });

  it('DELETE 词：删除后列表不含；不存在 id → 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '待删词', level: 'replace' })
      .expect(201);
    const id = created.body.data.id;
    await request(app.getHttpServer()).delete(`/api/compliance/words/${id}`).set(auth()).expect(200);
    await request(app.getHttpServer()).delete(`/api/compliance/words/${id}`).set(auth()).expect(404);

    const list = await request(app.getHttpServer()).get('/api/compliance/words').set(auth()).expect(200);
    expect(list.body.data.items.some((row: { word: string }) => row.word === '待删词')).toBe(false);
  });

  it('GET 分页 + level/status 过滤 + keyword 字面子串匹配（%/_ 按字面命中非通配）', async () => {
    // 造含 LIKE 通配符字面量的词（未转义直拼会退化通配：keyword='%' 将命中全部 a 开头词）
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: 'a%b', level: 'block' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: 'axb', level: 'block' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: 'a_b', level: 'block' })
      .expect(201);

    // keyword 含 % → 字面匹配仅 a%b（退化为通配会命中三行，该断言即设防）
    const literalPercent = await request(app.getHttpServer())
      .get('/api/compliance/words?keyword=a%25b')
      .set(auth())
      .expect(200);
    expect(literalPercent.body.data.items.map((row: { word: string }) => row.word)).toEqual(['a%b']);

    // keyword 含 _ → 字面匹配仅 a_b（不含 axb）
    const literalUnderscore = await request(app.getHttpServer())
      .get('/api/compliance/words?keyword=a_b')
      .set(auth())
      .expect(200);
    expect(literalUnderscore.body.data.items.map((row: { word: string }) => row.word)).toEqual(['a_b']);

    // keyword 仅一个 % → 仅含字面 % 的词命中
    const onlyPercent = await request(app.getHttpServer())
      .get('/api/compliance/words?keyword=%25')
      .set(auth())
      .expect(200);
    expect(onlyPercent.body.data.items.map((row: { word: string }) => row.word)).toEqual(['a%b']);

    // level 过滤（QueryBuilder 实体属性名路径）
    const reviewOnly = await request(app.getHttpServer())
      .get('/api/compliance/words?level=review')
      .set(auth())
      .expect(200);
    expect(reviewOnly.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(reviewOnly.body.data.items.every((row: { level: string }) => row.level === 'review')).toBe(true);

    // status 过滤：前文 PATCH 降级的「可改词」是唯一停用词
    const disabledOnly = await request(app.getHttpServer())
      .get('/api/compliance/words?status=0')
      .set(auth())
      .expect(200);
    expect(disabledOnly.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(disabledOnly.body.data.items.every((row: { status: number }) => row.status === 0)).toBe(true);

    // 分页字段回显
    const paged = await request(app.getHttpServer())
      .get('/api/compliance/words?page=1&pageSize=2')
      .set(auth())
      .expect(200);
    expect(paged.body.data.page).toBe(1);
    expect(paged.body.data.pageSize).toBe(2);
    expect(paged.body.data.items.length).toBeLessThanOrEqual(2);
    expect(paged.body.data.total).toBeGreaterThanOrEqual(paged.body.data.items.length);
  });

  it('权限 403 双向：仅 view 写 403；仅 manage 读 403', async () => {
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth(viewerToken))
      .send({ word: '无权词', level: 'block' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/compliance/words/1')
      .set(auth(viewerToken))
      .send({ remark: '无权' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/compliance/words/1')
      .set(auth(viewerToken))
      .expect(403);
    await request(app.getHttpServer()).get('/api/compliance/words').set(auth(manageOnlyToken)).expect(403);
  });

  it('纯空白 word → 422（@Length 校验 trim 前原文会放行，服务层 trim 后非空把关；POST/PATCH 双路径）', async () => {
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '   ', level: 'block' })
      .expect(422);

    // PATCH 路径同病同修：纯空白 word 不得把存量行改写成空串
    const created = await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '存量词', level: 'block' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/compliance/words/${created.body.data.id}`)
      .set(auth())
      .send({ word: '   ' })
      .expect(422);
    const after = await wordRepo.findOne({ where: { id: created.body.data.id } });
    expect(after?.word).toBe('存量词');

    // 评审①的后果断言：词库无空串词行落库（唯一索引不拦空串首条）
    const blanks = await wordRepo.find({ where: { word: '' } });
    expect(blanks).toHaveLength(0);
  });

  it('DTO 管道：word 超 64 字符 → 422；level 非法 → 422；非白名单字段 → 422', async () => {
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: 'a'.repeat(65), level: 'block' })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '合法词', level: 'forbidden' })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '合法词', level: 'block', unknownField: 1 })
      .expect(422);
  });

  // ---- 检查链段 ----

  it('aigcDeclared=false：无命中也 blocked，aigcCheck.verdict=blocked + 固定文案（平台强制红线）', async () => {
    const report = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '干净标题', aigcDeclared: false })
      .expect(200);
    expect(report.body.data.verdict).toBe('blocked');
    expect(report.body.data.checkedFields).toEqual(['title']);
    expect(report.body.data.aigcCheck).toEqual({
      declared: false,
      verdict: 'blocked',
      message: '未声明AI生成标识：各平台要求强制标识，请勾选声明后再登记发布'
    });
    expect(report.body.data.sensitiveHits).toEqual([]);
    expect(report.body.data.summary).toEqual({ block: 0, review: 0, replace: 0 });
    expect(report.body.data.verdictRule).toBe(
      '任一 block 命中或 AIGC 未声明 → blocked；无 block 且存在 review → review；否则 pass（replace 仅提示不影响结论）'
    );
  });

  it('已声明 + block 级命中 → blocked；明细含 field/word/level/start/end/context，summary 与命中恒一致', async () => {
    const report = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '十元起赌博网站速来', note: '备注无命中', aigcDeclared: true })
      .expect(200);
    expect(report.body.data.verdict).toBe('blocked');
    expect(report.body.data.checkedFields).toEqual(['title', 'note']);
    expect(report.body.data.sensitiveHits).toHaveLength(1);
    const hit = report.body.data.sensitiveHits[0];
    expect(hit).toMatchObject({
      field: 'title',
      word: '赌博',
      level: 'block',
      start: 3,
      end: 5
    });
    expect(hit.context).toContain('赌博');
    expect(report.body.data.summary).toEqual({ block: 1, review: 0, replace: 0 });
    // start/end 可回溯原始文本（UTF-16 码元偏移，长度保持归一的前提）
    expect('十元起赌博网站速来'.slice(hit.start, hit.end)).toBe('赌博');
  });

  it('review 级命中（无 block）→ review', async () => {
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '刷量', level: 'review' })
      .expect(201);
    const report = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '正常标题', note: '帮忙刷量涨粉', aigcDeclared: true })
      .expect(200);
    expect(report.body.data.verdict).toBe('review');
    expect(report.body.data.sensitiveHits).toHaveLength(1);
    expect(report.body.data.sensitiveHits[0]).toMatchObject({ field: 'note', word: '刷量', level: 'review' });
    expect(report.body.data.summary).toEqual({ block: 0, review: 1, replace: 0 });
  });

  it('仅 replace 级命中 → pass（不影响结论），suggestion 仅 replace 级且库词配置时非空', async () => {
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '微信', level: 'replace', suggestion: '私域' })
      .expect(201);
    const report = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '加微信了解详情', aigcDeclared: true })
      .expect(200);
    expect(report.body.data.verdict).toBe('pass');
    expect(report.body.data.sensitiveHits).toHaveLength(1);
    expect(report.body.data.sensitiveHits[0]).toMatchObject({
      field: 'title',
      word: '微信',
      level: 'replace',
      suggestion: '私域'
    });
    expect(report.body.data.summary).toEqual({ block: 0, review: 0, replace: 1 });
  });

  it('停用词（status=0）不参与扫描 → pass', async () => {
    await request(app.getHttpServer())
      .post('/api/compliance/words')
      .set(auth())
      .send({ word: '停用词', level: 'block', status: 0 })
      .expect(201);
    const report = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '含停用词的标题', aigcDeclared: true })
      .expect(200);
    expect(report.body.data.verdict).toBe('pass');
    expect(report.body.data.sensitiveHits).toEqual([]);
  });

  it('空文案 + 已声明 → pass 且 sensitiveHits=[]、checkedFields=[]（无文案字段照常判定）', async () => {
    const report = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ aigcDeclared: true })
      .expect(200);
    expect(report.body.data.verdict).toBe('pass');
    expect(report.body.data.checkedFields).toEqual([]);
    expect(report.body.data.sensitiveHits).toEqual([]);
    expect(report.body.data.aigcCheck).toEqual({ declared: true, verdict: 'pass', message: '' });
  });

  it('check 权限（与登记同宽 publisher:manage）：仅 publisher:manage 无 view → 200；仅 compliance:view（无任何 publisher 码）→ 403', async () => {
    const allowed = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth(publisherManageOnlyToken))
      .send({ aigcDeclared: true })
      .expect(200);
    expect(allowed.body.data.verdict).toBe('pass');

    await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth(viewerToken))
      .send({ aigcDeclared: true })
      .expect(403);
  });

  it('check 文案字段超长设防：title 255 / note 2000 边界 200，256 / 2001 → 422（钉住 run-check.dto 上限）', async () => {
    await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '好'.repeat(255), aigcDeclared: true })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '好'.repeat(256), aigcDeclared: true })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ note: '好'.repeat(2000), aigcDeclared: true })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ note: '好'.repeat(2001), aigcDeclared: true })
      .expect(422);
  });

  it('aigcDeclared 不传 → 422（必填字段 ValidationPipe 拦截）', async () => {
    const missing = await request(app.getHttpServer())
      .post('/api/compliance/check')
      .set(auth())
      .send({ title: '缺声明字段' })
      .expect(422);
    expect(missing.body.message).toContain('aigcDeclared');
  });
});
