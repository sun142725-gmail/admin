// 小说管线 TTS/字幕 e2e：
// 1) 单镜 regenerate step=audio：video_done 镜头补配音，只写音频三列、status 不回退；
// 2) POST :id/subtitle：SRT 落盘 + 时间轴按分段视频时长（videoSeconds）对齐（与 concat 成片一致，
//    不受 audioDurationMs 影响；空文本段占时不出字幕）；
// 3) ffmpeg 存在性探测：jest.mock('child_process') 带 E2E_SIMULATE_NO_FFMPEG 开关模拟「未安装 ffmpeg」，
//    恢复后的正向分支按本机是否装有 ffmpeg/ffprobe 条件断言（无 ffmpeg 主机断言继续拒绝，
//    无 ffprobe 主机断言回落 estimateSpeechMs），满足 AGENTS「环境性失败可移植」要求。
// 权限构造按 ai-admin.spec.ts:43-63 范式。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { NovelProject } from '../src/common/entities/novel-project.entity';
import { NovelShot } from '../src/common/entities/novel-shot.entity';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { encryptSecret } from '../src/modules/ai/core/crypto.util';
import { OpenAiCompatibleAdapter } from '../src/modules/ai/core/adapters/openai-compatible.adapter';
import { MP3_SILENT_500MS_BASE64 } from './fixtures/tts-fixtures';
import { assertFfmpegAvailable, resetBinaryProbeCache } from '../src/modules/flow/novel/novel-pipeline.service';
import { estimateSpeechMs } from '../src/modules/flow/engine/tts.util';

// 本机二进制探测（spawnSync 走 jest.mock 透传的原始实现，仅 -version 探测、不触网）：
// 条件断言依据，无 ffprobe/ffmpeg 的主机按回落路径断言，保证用例可移植。
const hasBinary = (bin: string): boolean => spawnSync(bin, ['-version'], { timeout: 5000 }).status === 0;
const hasFfprobe = hasBinary('ffprobe');
const hasFfmpeg = hasBinary('ffmpeg');

// execFile 打包模拟：默认转发真实实现；E2E_SIMULATE_NO_FFMPEG=1 时全部以 ENOENT 拒绝
// （装有 ffmpeg 的主机无法自然触发「未安装」分支，见方案/AGENTS 测试约定）。
jest.mock('child_process', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual: any = jest.requireActual('child_process');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const util = require('util');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped: any = (file: string, args: string[], optionsOrCallback: any, maybeCallback?: any) => {
    const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (process.env.E2E_SIMULATE_NO_FFMPEG === '1') {
      const error = new Error(`spawn ${file} ENOENT`) as Error & { code?: string };
      error.code = 'ENOENT';
      queueMicrotask(() => callback(error));
      return;
    }
    return actual.execFile(file, args, options, callback);
  };
  // 与真实 execFile 的 promisify 行为对齐：resolve { stdout, stderr }（管线解构 stdout 用）。
  wrapped[util.promisify.custom] = (file: string, args: string[], options?: unknown) =>
    new Promise((resolve, reject) => {
      wrapped(file, args, options ?? undefined, (err: Error | null, stdout: string, stderr: string) =>
        err ? reject(err) : resolve({ stdout, stderr })
      );
    });
  return { ...actual, execFile: wrapped };
});

describe('Novel TTS & subtitle (e2e)', () => {
  let app: INestApplication;
  let projectRepo: Repository<NovelProject>;
  let shotRepo: Repository<NovelShot>;
  let accessToken: string;
  let projectId: number;
  let videoDoneShotId: number;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

    // 假 TTS 适配器：返回真实 mp3 fixture（0.5s 静音），ffprobe 可实测时长。
    const fakeAdapter = {
      type: 'openai-compatible',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async speech(_options: unknown, _channel: unknown): Promise<{ audioBase64: string; mime: string }> {
        return { audioBase64: MP3_SILENT_500MS_BASE64, mime: 'audio/mpeg' };
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

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permissions = await permissionRepo.save(
      ['flow:define:manage', 'flow:run:execute', 'flow:run:view'].map((code) =>
        permissionRepo.create({ name: code, code })
      )
    );
    const role = await roleRepo.save(roleRepo.create({ name: '小说配音', code: 'novel-tts', permissions }));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'novel-tts', passwordHash, status: 1, roles: [role] }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'novel-tts', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;

    const modelRepo = moduleFixture.get<Repository<AiModel>>(getRepositoryToken(AiModel));
    await modelRepo.save(
      modelRepo.create({
        modelKey: 'e2e-tts',
        displayName: 'E2E 配音模型',
        type: 'openai-compatible',
        baseUrl: 'https://upstream.invalid/v1',
        apiKeyCipher: encryptSecret('sk-e2e-tts'),
        apiKeyMask: 'sk-****tts',
        capabilities: 'tts',
        status: 1
      })
    );

    projectRepo = moduleFixture.get<Repository<NovelProject>>(getRepositoryToken(NovelProject));
    shotRepo = moduleFixture.get<Repository<NovelShot>>(getRepositoryToken(NovelShot));

    // 项目 1：video_done 镜头（验证补配音不回退状态）。
    const project = await projectRepo.save(
      projectRepo.create({
        name: '配音项目',
        sourceText: '第一章 雪夜\n他推开门，看见漫天大雪。风把呼喊声吹散在夜里。',
        status: 'completed',
        stage: 'done',
        config: { shotsPerChapter: 3, videoSeconds: 5, imageSize: '1536x1024', videoSize: '1280x720' },
        createdBy: 1
      })
    );
    projectId = project.id;
    const shot = await shotRepo.save(
      shotRepo.create({
        projectId,
        chapterId: 0,
        idx: 1,
        scenePrompt: 'a wooden cabin, snow',
        motionPrompt: 'static shot',
        narration: '他推开门，看见漫天大雪。',
        status: 'video_done'
      })
    );
    videoDoneShotId = shot.id;
  });

  afterAll(async () => {
    delete process.env.E2E_SIMULATE_NO_FFMPEG;
    await app.close();
  });

  it('regenerate step=audio：video_done 镜头补配音，audioFile/audioUrl 落库落盘、时长实测 500ms、status 不回退', async () => {
    const regenerated = await request(app.getHttpServer())
      .post(`/api/novel-video/${projectId}/shots/${videoDoneShotId}/regenerate`)
      .set(auth())
      .send({ step: 'audio' })
      .expect(201);
    const shot = regenerated.body.data;
    expect(shot.status).toBe('video_done'); // 绝不回退：补音后仍为 video_done
    expect(shot.audioFile).toMatch(/^novel-video\/p\d+\/audio-c\d+-s\d+\.mp3$/);
    expect(shot.audioUrl).toBe(`/uploads/${shot.audioFile}`);
    // 有 ffprobe → 实测 fixture mp3 = 500ms，优先于估算；无 ffprobe → 回落 estimateSpeechMs
    // （中文 10 字 → 2500ms）。两种主机口径都断言，避免环境性失败。
    if (hasFfprobe) {
      expect(shot.audioDurationMs).toBe(500);
    } else {
      expect(shot.audioDurationMs).toBe(estimateSpeechMs('他推开门，看见漫天大雪。'));
    }
    expect(existsSync(join(process.cwd(), 'uploads', shot.audioFile))).toBe(true);
  });

  it('POST :id/subtitle：finalSubtitlePath 落库为 /uploads/ 路径、文件落盘、时间轴正确（空文本段占时不出字幕）', async () => {
    // 独立项目：三个 video_done 镜头（id 顺序 = concat 顺序），中间空旁白镜头占位。
    // 时间轴口径 = 分段视频时长（videoSeconds=5 → 每段 5s），配音时长 500/800/700ms 刻意不等，
    // 用于证明 SRT 不按 audioDurationMs 累加（那会与 concat 成片错位）。
    const project = await projectRepo.save(
      projectRepo.create({
        name: '字幕项目',
        sourceText: '第一章 灯火\n雪落无声。灯火渐明。',
        status: 'completed',
        stage: 'done',
        config: { shotsPerChapter: 3, videoSeconds: 5, imageSize: '1536x1024', videoSize: '1280x720' },
        createdBy: 1
      })
    );
    const rows = [
      { idx: 1, narration: '雪落无声。', audioDurationMs: 500 },
      { idx: 2, narration: '', audioDurationMs: 800 },
      { idx: 3, narration: '灯火渐明。', audioDurationMs: 700 }
    ];
    for (const row of rows) {
      await shotRepo.save(
        shotRepo.create({
          projectId: project.id,
          chapterId: 0,
          idx: row.idx,
          scenePrompt: 'scene',
          motionPrompt: 'static',
          narration: row.narration,
          audioDurationMs: row.audioDurationMs,
          status: 'video_done'
        })
      );
    }

    const result = await request(app.getHttpServer())
      .post(`/api/novel-video/${project.id}/subtitle`)
      .set(auth())
      .expect(201);
    const subtitlePath = result.body.data.subtitlePath as string;
    expect(subtitlePath).toBe(`/uploads/novel-video/p${project.id}/subtitle.srt`);

    const absolute = join(process.cwd(), 'uploads', subtitlePath.replace(/^\/uploads\//, ''));
    expect(existsSync(absolute)).toBe(true);
    const content = (await import('fs')).readFileSync(absolute, 'utf8');
    // 时间轴按分段视频时长（videoSeconds=5）逐段累加，与 concat 成片对齐；
    // 空旁白镜头只推进时间轴（5s→10s）不产出字幕条目。
    expect(content).toContain('1\n00:00:00,000 --> 00:00:05,000\n雪落无声。');
    expect(content).toContain('2\n00:00:10,000 --> 00:00:15,000\n灯火渐明。');
    expect(content).not.toContain('3\n');

    // 落库口径与 finalVideoPath 一致（/uploads/ 前缀）。
    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${project.id}`).set(auth()).expect(200);
    expect(detail.body.data.project.finalSubtitlePath).toBe(subtitlePath);
    // audioDurationMs 仍为配音实测/估算时长（供展示与阶段2混流），不再参与 SRT 时间轴。
    expect(detail.body.data.shots.every((shot: { audioDurationMs: number | null }) => (shot.audioDurationMs ?? 0) > 0)).toBe(
      true
    );
  });

  it('POST :id/subtitle：SRT 时间轴与分段视频时长对齐（基准 = 配置 videoSeconds，非固定值、非配音时长）', async () => {
    // 独立项目：videoSeconds=2（区别于上一用例的 5，证明基准取自配置），
    // 配音 300/700/900ms 与 2s 全不相等；空旁白镜头仍占位推进时间轴。
    const project = await projectRepo.save(
      projectRepo.create({
        name: '字幕对齐项目',
        sourceText: '第一章 测试\n对齐口径验证。',
        status: 'completed',
        stage: 'done',
        config: { shotsPerChapter: 3, videoSeconds: 2, imageSize: '1536x1024', videoSize: '1280x720' },
        createdBy: 1
      })
    );
    const rows = [
      { idx: 1, narration: '第一镜旁白。', audioDurationMs: 300 },
      { idx: 2, narration: '', audioDurationMs: 700 },
      { idx: 3, narration: '第三镜旁白。', audioDurationMs: 900 }
    ];
    for (const row of rows) {
      await shotRepo.save(
        shotRepo.create({
          projectId: project.id,
          chapterId: 0,
          idx: row.idx,
          scenePrompt: 'scene',
          motionPrompt: 'static',
          narration: row.narration,
          audioDurationMs: row.audioDurationMs,
          status: 'video_done'
        })
      );
    }

    const result = await request(app.getHttpServer())
      .post(`/api/novel-video/${project.id}/subtitle`)
      .set(auth())
      .expect(201);
    const absolute = join(process.cwd(), 'uploads', (result.body.data.subtitlePath as string).replace(/^\/uploads\//, ''));
    const content = (await import('fs')).readFileSync(absolute, 'utf8');
    // 成片 = 3 段 × 2s = 6s：第 1 段 0-2s，空段 2-4s 推进不出条目，第 3 段 4-6s——
    // 与 concat 成片逐段对齐（若按配音 300/700/900ms 累加则完全错位）。
    expect(content).toContain('1\n00:00:00,000 --> 00:00:02,000\n第一镜旁白。');
    expect(content).toContain('2\n00:00:04,000 --> 00:00:06,000\n第三镜旁白。');
    expect(content).not.toContain('00:00:02,000 --> 00:00:04,000'); // 空文本段不出条目
  });

  it('ffmpeg 存在性探测：模拟未安装时明确报「主机未安装 ffmpeg」，恢复后按本机能力条件断言', async () => {
    process.env.E2E_SIMULATE_NO_FFMPEG = '1';
    resetBinaryProbeCache();
    await expect(assertFfmpegAvailable()).rejects.toThrow('主机未安装 ffmpeg');
    // 恢复真实环境（探测结果缓存重置后重探）：
    // 有 ffmpeg → 放行；无 ffmpeg（如 CI 精简镜像）→ 继续明确拒绝，用例在两种主机上都成立。
    delete process.env.E2E_SIMULATE_NO_FFMPEG;
    resetBinaryProbeCache();
    if (hasFfmpeg) {
      await expect(assertFfmpegAvailable()).resolves.toBeUndefined();
    } else {
      await expect(assertFfmpegAvailable()).rejects.toThrow('主机未安装 ffmpeg');
    }
  });
});
