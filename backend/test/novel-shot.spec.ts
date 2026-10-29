// 小说单镜创作控制 e2e：片段配置持久化、AI 重新规划（锁定原文保旁白）、单镜重生成（data: URL 假上游）、
// i2v 首帧衔接（APP_PUBLIC_BASE_URL 拼接与回落）、assertProjectIdle 互斥。
// 权限构造按 ai-admin.spec.ts:43-63 范式：权限码 → 角色 → 用户 → 登录（PermissionsGuard 全码覆盖校验）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { AiModel } from '../src/common/entities/ai-model.entity';
import { encryptSecret } from '../src/modules/ai/core/crypto.util';
import { OpenAiCompatibleAdapter } from '../src/modules/ai/core/adapters/openai-compatible.adapter';
import { VideoUpstreamService } from '../src/modules/flow/engine/video-upstream.service';
import { assertProjectIdle } from '../src/modules/flow/novel/novel-pipeline.service';

// 1x1 PNG data URL：regenerate step=image 的假上游返回，走 urlToBuffer 的 data: 分支落盘。
const FAKE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// 假视频 data URL（不校验编码，仅验证下载落盘链路）。
const FAKE_MP4_DATA_URL = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';

// AI 重新规划返回（带 ```json 围栏，顺带验证 parseJsonBlock 容错）。
const REPLAN_JSON =
  '```json\n{"scenePrompt":"a lone cabin in heavy snowfall, wide shot","motionPrompt":"slow dolly forward, falling snow","narration":"AI 新旁白不应生效"}\n```';

describe('Novel shot control (e2e)', () => {
  // 假视频上游捕获的入参序列（验证 i2v firstFrameUrl 拼接与回落）。
  const videoCaptures: Array<Record<string, unknown>> = [];
  let app: INestApplication;
  let userRepo: Repository<User>;
  let projectRepo: Repository<NovelProject>;
  let chapterRepo: Repository<NovelChapter>;
  let shotRepo: Repository<NovelShot>;
  let accessToken: string;
  let projectId: number;
  let shotId: number;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

    // 假 openai-compatible 适配器：replan 走 chatStream，重生成出图走 images（data: URL 免网络）。
    const fakeAdapter = {
      type: 'openai-compatible',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async *chatStream(_messages: unknown, _options: unknown, _channel: unknown): AsyncGenerator<string> {
        yield REPLAN_JSON;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async images(_options: unknown, _channel: unknown): Promise<Array<{ url: string }>> {
        return [{ url: FAKE_PNG_DATA_URL }];
      }
    };
    // 假视频上游：捕获入参（验证 i2v firstFrameUrl 拼接/回落），返回 data: URL 片段。
    const fakeVideo = {
      generate: async (_userId: number, options: Record<string, unknown>) => {
        videoCaptures.push(options);
        return { url: FAKE_MP4_DATA_URL, taskId: 'task-e2e', latencyMs: 1 };
      }
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OpenAiCompatibleAdapter)
      .useValue(fakeAdapter)
      .overrideProvider(VideoUpstreamService)
      .useValue(fakeVideo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    // 权限 → 角色 → 用户 → 登录（三码齐备，PermissionsGuard every 覆盖校验）。
    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permissions = await permissionRepo.save(
      ['flow:define:manage', 'flow:run:execute', 'flow:run:view'].map((code) =>
        permissionRepo.create({ name: code, code })
      )
    );
    const role = await roleRepo.save(roleRepo.create({ name: '小说测试', code: 'novel-test', permissions }));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'novel-tester', passwordHash, status: 1, roles: [role] }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'novel-tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;

    // 模型行：replan(chat)/produceImage(image) 经 candidatesByCapability 路由，密文需可解密。
    const modelRepo = moduleFixture.get<Repository<AiModel>>(getRepositoryToken(AiModel));
    await modelRepo.save(
      modelRepo.create({
        modelKey: 'e2e-all',
        displayName: 'E2E 全能模型',
        type: 'openai-compatible',
        baseUrl: 'https://upstream.invalid/v1',
        apiKeyCipher: encryptSecret('sk-e2e'),
        apiKeyMask: 'sk-****e2e',
        capabilities: 'chat,image,tts',
        status: 1
      })
    );

    projectRepo = moduleFixture.get<Repository<NovelProject>>(getRepositoryToken(NovelProject));
    chapterRepo = moduleFixture.get<Repository<NovelChapter>>(getRepositoryToken(NovelChapter));
    shotRepo = moduleFixture.get<Repository<NovelShot>>(getRepositoryToken(NovelShot));

    // 建项目 + 章节 + 分镜（分镜直插，避免依赖真实 LLM 分镜）。
    const created = await request(app.getHttpServer())
      .post('/api/novel-video')
      .set(auth())
      .send({
        name: '单镜控制项目',
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
        scenePrompt: 'a wooden cabin, snow',
        motionPrompt: 'static shot',
        narration: '他推开门，看见漫天大雪。',
        lockedSourceText: '他推开门，看见漫天大雪。',
        shotMode: 'i2v',
        status: 'pending'
      })
    );
    shotId = shot.id;
  });

  afterAll(async () => {
    delete process.env.APP_PUBLIC_BASE_URL;
    await app.close();
  });

  it('PUT 片段配置持久化：创作控制字段写入并在 detail 可见', async () => {
    const updated = await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}/shots/${shotId}`)
      .set(auth())
      .send({
        lockedSourceText: '他推开门，看见漫天大雪。',
        visualTask: '突出风雪中的木门与脚印',
        progression: '缓慢推进',
        shotMode: 't2v',
        firstFrameLocked: true,
        narration: '风雪夜，他推开了那扇门。'
      })
      .expect(200);
    expect(updated.body.data.visualTask).toBe('突出风雪中的木门与脚印');
    expect(updated.body.data.progression).toBe('缓慢推进');
    expect(updated.body.data.shotMode).toBe('t2v');
    expect(updated.body.data.firstFrameLocked).toBe(true);
    expect(updated.body.data.narration).toBe('风雪夜，他推开了那扇门。');

    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${projectId}`).set(auth()).expect(200);
    const shot = detail.body.data.shots.find((item: { id: number }) => item.id === shotId);
    expect(shot.lockedSourceText).toBe('他推开门，看见漫天大雪。');
    expect(shot.shotMode).toBe('t2v');
    expect(shot.narration).toBe('风雪夜，他推开了那扇门。');
  });

  it('非法 shotMode 断言 422（IsIn 白名单）', async () => {
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}/shots/${shotId}`)
      .set(auth())
      .send({ shotMode: 'v2i' })
      .expect(422);
  });

  it('replan：lockedSourceText 非空时旁白保留原值，仅画面/运动提示词更新', async () => {
    const replanned = await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/shots/${shotId}/replan`)
      .set(auth())
      .expect(201);
    expect(replanned.body.data.scenePrompt).toBe('a lone cabin in heavy snowfall, wide shot');
    expect(replanned.body.data.motionPrompt).toBe('slow dolly forward, falling snow');
    // 旁白锁定：假上游返回的 narration「AI 新旁白不应生效」必须被丢弃（保留 PUT 修改后的旁白）。
    expect(replanned.body.data.narration).toBe('风雪夜，他推开了那扇门。');
    expect(replanned.body.data.status).toBe('pending');
  });

  it('regenerate step=image：data: URL 假上游落盘 imageUrl，status 推进 image_done', async () => {
    const regenerated = await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/shots/${shotId}/regenerate`)
      .set(auth())
      .send({ step: 'image' })
      .expect(201);
    const imageUrl = regenerated.body.data.imageUrl as string;
    expect(imageUrl).toMatch(/^\/uploads\/novel-video\/p\d+\/shot-c\d+-s\d+\.jpg$/);
    expect(existsSync(join(process.cwd(), imageUrl))).toBe(true);
    expect(regenerated.body.data.status).toBe('image_done');
  });

  it('regenerate step=video：未配置 APP_PUBLIC_BASE_URL 回落文生视频并提示；配置后 i2v 拼接公网首帧', async () => {
    // PUT 用例把 shotMode 改成了 t2v：先切回 i2v 才能验证首帧衔接分支。
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}/shots/${shotId}`)
      .set(auth())
      .send({ shotMode: 'i2v' })
      .expect(200);

    delete process.env.APP_PUBLIC_BASE_URL;
    const fallback = await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/shots/${shotId}/regenerate`)
      .set(auth())
      .send({ step: 'video' })
      .expect(201);
    expect(fallback.body.data.status).toBe('video_done');
    // videoFile 是相对 uploads 的路径（与 imageUrl 的 /uploads/ 前缀口径不同）。
    expect(existsSync(join(process.cwd(), 'uploads', fallback.body.data.videoFile))).toBe(true);

    // 回落分支：firstFrameUrl 不传（undefined），且项目 stage_message 提示缺失公网地址。
    const fallbackOptions = videoCaptures[videoCaptures.length - 1];
    expect(fallbackOptions.firstFrameUrl).toBeUndefined();
    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${projectId}`).set(auth()).expect(200);
    expect(detail.body.data.project.stageMessage).toContain('APP_PUBLIC_BASE_URL');

    // i2v 分支：配置公网地址后 firstFrameUrl = 公网前缀 + /uploads/ 相对路径（尾部斜杠被归一）。
    process.env.APP_PUBLIC_BASE_URL = 'https://media.example.com/';
    const second = await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/shots/${shotId}/regenerate`)
      .set(auth())
      .send({ step: 'video' })
      .expect(201);
    expect(second.body.data.status).toBe('video_done');
    expect(second.body.data.videoUrl).toMatch(/^\/uploads\/novel-video\/p\d+\/seg-c\d+-s\d+\.mp4$/);
    const i2vOptions = videoCaptures[videoCaptures.length - 1];
    expect(i2vOptions.firstFrameUrl).toMatch(/^https:\/\/media\.example\.com\/uploads\/novel-video\/p\d+\/shot-c\d+-s\d+\.jpg$/);
    delete process.env.APP_PUBLIC_BASE_URL;
  });

  it('assertProjectIdle：运行中项目互斥抛 BadRequest，空闲项目放行', () => {
    const active = new Set<number>([projectId]);
    expect(() => assertProjectIdle(active, projectId)).toThrow(BadRequestException);
    expect(() => assertProjectIdle(active, projectId + 1)).not.toThrow();
  });
});
