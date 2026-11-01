// 作品封面 e2e：coverUrl 三处透传（PUT 落库 / detail 回读 / 列表 summary 映射）与校验。
// 封面本体由前端 canvas 合成后经 /files/upload 上传，后端只负责存路径——此处不涉及生图上游。
// 范式照抄 novel-shot.spec.ts 的权限构造（权限码→角色→用户→登录）。
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
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Novel project cover (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
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

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permissions = await permissionRepo.save(
      ['flow:define:manage', 'flow:run:view'].map((code) => permissionRepo.create({ name: code, code }))
    );
    const role = await roleRepo.save(roleRepo.create({ name: '封面测试', code: 'novel-cover-test', permissions }));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'novel-cover-tester', passwordHash, status: 1, roles: [role] }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'novel-cover-tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;

    const created = await request(app.getHttpServer())
      .post('/api/novel-video')
      .set(auth())
      .send({
        name: '封面项目',
        text: '第一章 雪夜\n他推开门，看见漫天大雪。路灯下脚印延伸向远方，风把呼喊声吹散在夜里。'
      })
      .expect(201);
    projectId = created.body.data.project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('PUT coverUrl → detail.project.coverUrl 与列表 summary.coverUrl 均回读（锁 update/select/映射三处透传）', async () => {
    const updated = await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ coverUrl: '/uploads/common/cover-e2e.png' })
      .expect(200);
    expect(updated.body.data.project.coverUrl).toBe('/uploads/common/cover-e2e.png');

    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${projectId}`).set(auth()).expect(200);
    expect(detail.body.data.project.coverUrl).toBe('/uploads/common/cover-e2e.png');

    const list = await request(app.getHttpServer()).get('/api/novel-video').set(auth()).expect(200);
    const summary = list.body.data.find((item: { id: number }) => item.id === projectId);
    expect(summary.coverUrl).toBe('/uploads/common/cover-e2e.png');
  });

  it('PUT 不传 coverUrl 时原值保持（undefined 语义，不被误清空）', async () => {
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ stylePrompt: 'cinematic lighting' })
      .expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${projectId}`).set(auth()).expect(200);
    expect(detail.body.data.project.coverUrl).toBe('/uploads/common/cover-e2e.png');
    expect(detail.body.data.project.stylePrompt).toBe('cinematic lighting');
  });

  it('PUT coverUrl 空串归 null（清除封面）', async () => {
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ coverUrl: '   ' })
      .expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/novel-video/${projectId}`).set(auth()).expect(200);
    expect(detail.body.data.project.coverUrl).toBeNull();
  });

  it('PUT coverUrl 超 500 字符 → 422（MaxLength 校验）', async () => {
    await request(app.getHttpServer())
      .put(`/api/novel-video/${projectId}`)
      .set(auth())
      .send({ coverUrl: `/uploads/common/${'a'.repeat(500)}.png` })
      .expect(422);
  });
});
