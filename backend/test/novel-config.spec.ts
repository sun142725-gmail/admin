// 项目多规格/音频配置 e2e（novel-tts.spec.ts 权限构造范式）：
// 1) PUT config{aspect/bgmUrl/subtitleStyle/bgmVolume} 持久化后 detail 回读；
// 2) 非法 aspect / subtitleStyle / bgmVolume 越界 → 422（ValidationPipe 400 经 HttpExceptionFilter
//    统一映射 422，见 http-exception.filter.ts:38-40；config 启用 @ValidateNested 子集校验）；
// 3) POST /files/upload-audio：mp3 成功返回 /uploads/novel-bgm/ 路径、.txt 拒绝（422）、
//    超 10MB 拒绝（multer LIMIT_FILE_SIZE → PayloadTooLargeException 413）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { NovelProject } from '../src/common/entities/novel-project.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Novel project AV config (e2e)', () => {
  let app: INestApplication;
  let projectRepo: Repository<NovelProject>;
  let accessToken: string;
  let projectId: number;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permissions = await permissionRepo.save(
      ['flow:define:manage', 'flow:run:view'].map((code) => permissionRepo.create({ name: code, code }))
    );
    const role = await roleRepo.save(roleRepo.create({ name: '配置测试', code: 'novel-config-test', permissions }));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'novel-config-tester', passwordHash, status: 1, roles: [role] }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'novel-config-tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;

    projectRepo = moduleFixture.get<Repository<NovelProject>>(getRepositoryToken(NovelProject));
    const project = await projectRepo.save(
      projectRepo.create({
        name: '配置项目',
        sourceText: '第一章 配置\n多规格与音频配置验证。',
        status: 'draft',
        stage: 'split',
        config: { shotsPerChapter: 3, videoSeconds: 5, imageSize: '1536x1024', videoSize: '1280x720' },
        createdBy: 1
      })
    );
    projectId = project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('PUT config{aspect/bgmUrl/subtitleStyle/bgmVolume} 持久化，detail 回读；既有字段浅合并保留', async () => {
    const updated = await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({
        config: {
          aspect: '9:16',
          bgmUrl: '/uploads/novel-bgm/1.mp3',
          subtitleStyle: 'big',
          bgmVolume: 0.35
        }
      })
      .expect(200);
    const config = updated.body.data.project.config;
    expect(config.aspect).toBe('9:16');
    expect(config.bgmUrl).toBe('/uploads/novel-bgm/1.mp3');
    expect(config.subtitleStyle).toBe('big');
    expect(config.bgmVolume).toBe(0.35);
    // 浅合并：既有 shotsPerChapter/videoSeconds 不丢
    expect(config.shotsPerChapter).toBe(3);
    expect(config.videoSeconds).toBe(5);

    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${projectId}`).set(auth()).expect(200);
    expect(detail.body.data.project.config.aspect).toBe('9:16');
    expect(detail.body.data.project.config.subtitleStyle).toBe('big');
  });

  it('非法 aspect（不在 16:9/9:16/1:1）→ 422（config 嵌套校验生效）', async () => {
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ config: { aspect: '4:3' } })
      .expect(422);
    // 非法值不落库
    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${projectId}`).set(auth()).expect(200);
    expect(detail.body.data.project.config.aspect).toBe('9:16');
  });

  it('非法 subtitleStyle / bgmVolume 越界 → 422', async () => {
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ config: { subtitleStyle: 'huge' } })
      .expect(422);
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ config: { bgmVolume: 1.5 } })
      .expect(422);
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ config: { bgmVolume: -0.1 } })
      .expect(422);
  });

  it('upload-audio：mp3 成功返回 /uploads/novel-bgm/ 路径', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/files/upload-audio')
      .set(auth())
      .attach('file', Buffer.from([0xff, 0xfb, 0x80, 0x00, 0x00, 0x00]), { filename: 'bgm.mp3', contentType: 'audio/mpeg' })
      .expect(201);
    expect(response.body.data.url).toMatch(/^\/uploads\/novel-bgm\/\d+\.mp3$/);
  });

  it('upload-audio：.txt 拒绝（422：fileFilter BadRequest 经过滤器映射）', async () => {
    await request(app.getHttpServer())
      .post('/api/files/upload-audio')
      .set(auth())
      .attach('file', Buffer.from('not audio'), { filename: 'evil.txt', contentType: 'text/plain' })
      .expect(422);
  });

  it('upload-audio：超 10MB 拒绝（multer LIMIT_FILE_SIZE → 413）', async () => {
    await request(app.getHttpServer())
      .post('/api/files/upload-audio')
      .set(auth())
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'big.mp3', contentType: 'audio/mpeg' })
      .expect(413);
  });

  it('upload-audio：未携带文件 → 422（controller BadRequest 经过滤器映射）', async () => {
    await request(app.getHttpServer()).post('/api/files/upload-audio').set(auth()).expect(422);
  });
});
