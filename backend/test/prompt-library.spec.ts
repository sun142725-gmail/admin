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
