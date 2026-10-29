// InternalAi 模块测试：内部令牌 fail-closed 语义 + 无可用模型时的降级响应。
// 不真实调用上游——纯接口契约与鉴权边界测试（生图/对话真实链路由 E2E 环境覆盖）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as request from 'supertest';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('InternalAi (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.INTERNAL_API_TOKEN = 'test_internal_token';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    // 与 main.ts 引导保持一致（JSON 大 body 上限不在此复现，不属本套件断言面）
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const internalHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Internal-Token': 'test_internal_token'
  });

  it('未携带内部令牌应 401（fail-closed）', async () => {
    await request(app.getHttpServer())
      .post('/api/internal/ai/image')
      .send({ userId: 1, prompt: 'x' })
      .expect(401);
  });

  it('错误的内部令牌应 401', async () => {
    await request(app.getHttpServer())
      .post('/api/internal/ai/image')
      .set('X-Internal-Token', 'wrong_token')
      .send({ userId: 1, prompt: 'x' })
      .expect(401);
  });

  it('未配置任何 image 能力模型时返回 503 且带可读原因', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/internal/ai/image')
      .set(internalHeaders())
      .send({ userId: 1, prompt: '测试 prompt' })
      .expect(503);
    expect(response.body.message).toContain('没有可用的生图模型');
  });

  it('未配置任何 chat 能力模型时返回 503', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/internal/ai/chat')
      .set(internalHeaders())
      .send({ userId: 1, messages: [{ role: 'user', content: '你好' }] })
      .expect(503);
    expect(response.body.message).toContain('没有可用的对话模型');
  });

  it('未配置任何 tts 能力模型时返回 503', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/internal/ai/tts')
      .set(internalHeaders())
      .send({ userId: 1, text: '测试文本' })
      .expect(503);
    expect(response.body.message).toContain('没有可用的语音模型');
  });

  it('请求体缺 userId 应被校验拦截（422）', async () => {
    await request(app.getHttpServer())
      .post('/api/internal/ai/image')
      .set(internalHeaders())
      .send({ prompt: '没有 userId' })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });

  it('chat 消息体非法（空 content）应 400', async () => {
    await request(app.getHttpServer())
      .post('/api/internal/ai/chat')
      .set(internalHeaders())
      .send({ userId: 1, messages: [{ role: 'user', content: '' }] })
      .expect(422); // 项目约定：BadRequest 统一映射 422
  });
});
