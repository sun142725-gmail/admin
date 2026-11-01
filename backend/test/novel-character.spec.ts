// 角色库 e2e：CRUD 全链、分镜出图注入角色参考（假 adapter 捕获 referenceImages/prompt 断言）、
// 无角色卡时保持旧行为（不切 edits 通道）、跨控制器路由可达回归。
// 范式照抄 novel-shot.spec.ts：权限构造（权限码→角色→用户→登录）、overrideProvider(OpenAiCompatibleAdapter)。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { NovelProject } from '../src/common/entities/novel-project.entity';
import { NovelChapter } from '../src/common/entities/novel-chapter.entity';
import { NovelShot } from '../src/common/entities/novel-shot.entity';
import { CharacterCard } from '../src/common/entities/character-card.entity';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { encryptSecret } from '../src/modules/ai/core/crypto.util';
import { OpenAiCompatibleAdapter } from '../src/modules/ai/core/adapters/openai-compatible.adapter';

// 1x1 PNG data URL：假上游返回，走 urlToBuffer 的 data: 分支落盘。
const FAKE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// 真实 PNG 字节（与 data URL 载荷一致），beforeAll 写入 uploads 供角色参考图读盘。
const FAKE_PNG_BYTES = Buffer.from(FAKE_PNG_DATA_URL.slice(FAKE_PNG_DATA_URL.indexOf(',') + 1), 'base64');

// 假 adapter 捕获的 images 入参（验证 referenceImages 透传与 prompt 拼装）。
const imageCaptures: Array<{ prompt: string; referenceImages?: string[] }> = [];

describe('Novel character cards (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let projectRepo: Repository<NovelProject>;
  let chapterRepo: Repository<NovelChapter>;
  let shotRepo: Repository<NovelShot>;
  let characterRepo: Repository<CharacterCard>;
  let accessToken: string;
  let projectId: number;
  let shotId: number;
  let cardId: number;
  // uploads 根下 e2e- 前缀临时参考图（相对 uploads 的路径），afterAll 清理。
  const tempRefName = `e2e-character-ref-${Date.now()}.png`;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

    // 临时参考图落盘 uploads 根（e2e- 前缀，afterAll rm 清理）。
    await mkdir(join(process.cwd(), 'uploads'), { recursive: true });
    await writeFile(join(process.cwd(), 'uploads', tempRefName), FAKE_PNG_BYTES);

    // 假 openai-compatible 适配器：images 捕获入参后返回 data: URL（免网络）。
    const fakeAdapter = {
      type: 'openai-compatible',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async images(_options: unknown, _channel: unknown): Promise<Array<{ url: string }>> {
        const options = _options as { prompt: string; referenceImages?: string[] };
        imageCaptures.push({ prompt: options.prompt, referenceImages: options.referenceImages });
        return [{ url: FAKE_PNG_DATA_URL }];
      }
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OpenAiCompatibleAdapter)
      .useValue(fakeAdapter)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // 权限 → 角色 → 用户 → 登录（PermissionsGuard every 覆盖校验）。
    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permissions = await permissionRepo.save(
      ['flow:define:manage', 'flow:run:execute', 'flow:run:view'].map((code) =>
        permissionRepo.create({ name: code, code })
      )
    );
    const role = await roleRepo.save(roleRepo.create({ name: '角色测试', code: 'novel-character-test', permissions }));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'novel-character-tester', passwordHash, status: 1, roles: [role] }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'novel-character-tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;

    // 模型行：produceImage(image) 经 candidatesByCapability 路由，密文需可解密。
    const modelRepo = moduleFixture.get<Repository<AiModel>>(getRepositoryToken(AiModel));
    await modelRepo.save(
      modelRepo.create({
        modelKey: 'e2e-character-image',
        displayName: 'E2E 生图模型',
        type: 'openai-compatible',
        baseUrl: 'https://upstream.invalid/v1',
        apiKeyCipher: encryptSecret('sk-e2e'),
        apiKeyMask: 'sk-****e2e',
        capabilities: 'image',
        status: 1
      })
    );

    projectRepo = moduleFixture.get<Repository<NovelProject>>(getRepositoryToken(NovelProject));
    chapterRepo = moduleFixture.get<Repository<NovelChapter>>(getRepositoryToken(NovelChapter));
    shotRepo = moduleFixture.get<Repository<NovelShot>>(getRepositoryToken(NovelShot));
    characterRepo = moduleFixture.get<Repository<CharacterCard>>(getRepositoryToken(CharacterCard));

    // 建项目 + 章节 + 分镜（分镜直插，避免依赖真实 LLM 分镜）。
    const created = await request(app.getHttpServer())
      .post('/api/novel-video')
      .set(auth())
      .send({
        name: '角色库项目',
        text: '第一章 雪夜\n他推开门，看见漫天大雪。路灯下脚印延伸向远方，风把呼喊声吹散在夜里。'
      })
      .expect(201);
    projectId = created.body.data.project.id;
    const chapter = await chapterRepo.save(
      chapterRepo.create({ projectId, idx: 1, title: '第一章 雪夜', content: '他推开门，看见漫天大雪。', status: 'storyboarded' })
    );
    const shot = await shotRepo.save(
      shotRepo.create({
        projectId,
        chapterId: chapter.id,
        idx: 1,
        scenePrompt: 'a girl standing in heavy snowfall',
        motionPrompt: 'slow push in',
        narration: '他推开门，看见漫天大雪。',
        status: 'pending'
      })
    );
    shotId = shot.id;
  });

  afterAll(async () => {
    await rm(join(process.cwd(), 'uploads', tempRefName), { force: true });
    expect(existsSync(join(process.cwd(), 'uploads', tempRefName))).toBe(false);
    await app.close();
  });

  it('路由顺序回归：GET /api/novel-video/characters?projectId= 可达（未被 @Get(:id) ParseIntPipe 捕获 400）', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/novel-video/characters')
      .query({ projectId })
      .set(auth())
      .expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    // 无角色时列表为空。
    expect(response.body.data).toEqual([]);
  });

  it('projectId 非数值 → 校验拒绝（全局 ValidationPipe 把 ParseIntPipe 的 400 归一为 422，与 DTO 失败同口径）', async () => {
    await request(app.getHttpServer())
      .get('/api/novel-video/characters')
      .query({ projectId: 'abc' })
      .set(auth())
      .expect(422);
  });

  it('CRUD 全链：POST（/uploads/ 真实返回格式路径）→ GET 列表 → PATCH → DELETE', async () => {
    // referenceImages 走 files/upload 真实返回格式（'/uploads/' 开头），锁归一化链路不被绕过。
    const created = await request(app.getHttpServer())
      .post('/api/novel-video/characters')
      .set(auth())
      .send({
        projectId,
        name: '林晚',
        appearance: '银白长发，红瞳，黑色风衣',
        referenceImages: ['/uploads/common/char-1.png', '/uploads/common/char-2.png'],
        isPrimary: true
      })
      .expect(201);
    expect(created.body.data.projectId).toBe(projectId);
    expect(created.body.data.name).toBe('林晚');
    expect(created.body.data.referenceImages).toEqual(['/uploads/common/char-1.png', '/uploads/common/char-2.png']);
    expect(created.body.data.isPrimary).toBe(true);
    expect(created.body.data.createdBy).toBeGreaterThan(0);
    cardId = created.body.data.id;

    const list = await request(app.getHttpServer())
      .get('/api/novel-video/characters')
      .query({ projectId })
      .set(auth())
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(cardId);

    const updated = await request(app.getHttpServer())
      .patch(`/api/novel-video/characters/${cardId}`)
      .set(auth())
      .send({ appearance: '银白长发，红瞳，白色风衣', isPrimary: false })
      .expect(200);
    expect(updated.body.data.appearance).toBe('银白长发，红瞳，白色风衣');
    expect(updated.body.data.isPrimary).toBe(false);
    // 未传字段保持原值。
    expect(updated.body.data.name).toBe('林晚');
    expect(updated.body.data.referenceImages).toEqual(['/uploads/common/char-1.png', '/uploads/common/char-2.png']);

    // DTO 校验：参考图超 4 张 → 422。
    await request(app.getHttpServer())
      .post('/api/novel-video/characters')
      .set(auth())
      .send({
        projectId,
        name: '超限角色',
        referenceImages: ['/uploads/1.png', '/uploads/2.png', '/uploads/3.png', '/uploads/4.png', '/uploads/5.png']
      })
      .expect(422);

    const removed = await request(app.getHttpServer())
      .delete(`/api/novel-video/characters/${cardId}`)
      .set(auth())
      .expect(200);
    expect(removed.body.data.success).toBe(true);
    await request(app.getHttpServer()).delete(`/api/novel-video/characters/${cardId}`).set(auth()).expect(404);
  });

  it('分镜重生成注入：角色描述进 prompt，/uploads/ 参考图读盘转 data URL 透传（切 edits 通道）', async () => {
    // 直插角色卡：参考图指向 beforeAll 写入的 uploads 临时文件（'/uploads/' 前缀原样存储）。
    await characterRepo.save(
      characterRepo.create({
        projectId,
        name: '林晚',
        appearance: '银白长发，红瞳，黑色风衣',
        referenceImages: [`/uploads/${tempRefName}`],
        isPrimary: true,
        sortOrder: 0,
        createdBy: 1
      })
    );
    imageCaptures.length = 0;
    const regenerated = await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/shots/${shotId}/regenerate`)
      .set(auth())
      .send({ step: 'image' })
      .expect(201);
    expect(regenerated.body.data.status).toBe('image_done');

    expect(imageCaptures).toHaveLength(1);
    const capture = imageCaptures[0];
    // 描述注入：角色名与外观片段出现在合成 prompt 中，位置在 scenePrompt 之后。
    expect(capture.prompt).toContain('a girl standing in heavy snowfall');
    expect(capture.prompt).toContain('林晚: 银白长发，红瞳，黑色风衣');
    // 参考图透传：读盘 → data URL（前缀与载荷）。
    expect(Array.isArray(capture.referenceImages)).toBe(true);
    expect(capture.referenceImages).toHaveLength(1);
    expect(capture.referenceImages![0]).toMatch(/^data:image\/png;base64,/);
    expect(capture.referenceImages![0]).toBe(FAKE_PNG_DATA_URL);
  });

  it('无角色卡/参考图缺失时保持旧行为：referenceImages 为 undefined（不切 edits 通道）', async () => {
    // 清空该项目角色卡（删除后无卡 → 不注入）。
    await characterRepo.delete({ projectId });
    imageCaptures.length = 0;
    await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/shots/${shotId}/regenerate`)
      .set(auth())
      .send({ step: 'image' })
      .expect(201);
    expect(imageCaptures).toHaveLength(1);
    expect(imageCaptures[0].referenceImages).toBeUndefined();
    expect(imageCaptures[0].prompt).not.toContain('林晚');
  });

  it('重切分保留角色卡：POST :id/split 清章节/分镜产物但角色卡原样保留（仅整项目删除才清卡）', async () => {
    // 直插一张角色卡（含参考图），随后触发重切分。
    const card = await characterRepo.save(
      characterRepo.create({
        projectId,
        name: '沈青',
        appearance: '黑色短发，灰瞳，长款大衣',
        referenceImages: [`/uploads/${tempRefName}`],
        isPrimary: false,
        sortOrder: 0,
        createdBy: 1
      })
    );
    const splitResponse = await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/split`)
      .set(auth())
      .expect(201);
    // 重切分本身生效：分镜产物清空、章节按原文重切并回到 pending。
    expect(splitResponse.body.data.shots).toEqual([]);
    expect(splitResponse.body.data.chapters.length).toBeGreaterThan(0);
    expect(
      splitResponse.body.data.chapters.every((chapter: { status: string }) => chapter.status === 'pending')
    ).toBe(true);

    // 角色卡不被连带删除：重切分后列表仍含原卡且字段完整（重出片依赖角色一致性注入）。
    const cards = await request(app.getHttpServer())
      .get('/api/novel-video/characters')
      .query({ projectId })
      .set(auth())
      .expect(200);
    const found = cards.body.data.find((item: { id: number }) => item.id === card.id);
    expect(found).toBeDefined();
    expect(found.name).toBe('沈青');
    expect(found.appearance).toBe('黑色短发，灰瞳，长款大衣');
    expect(found.referenceImages).toEqual([`/uploads/${tempRefName}`]);
    expect(found.isPrimary).toBe(false);
  });
});
