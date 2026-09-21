// AI 管理端 e2e：模型（端点/密钥）CRUD 与去重、智能体校验、对话两段式兜底。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('AI Admin (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let accessToken: string;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    await app.init();

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    // 给测试用户挂 AI 管理权限角色。
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    const permissions = await permissionRepo.save(
      ['ai:model:manage', 'ai:agent:manage', 'ai:chat:use', 'ai:image:use'].map((code) =>
        permissionRepo.create({ name: code, code })
      )
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: 'AI测试', code: 'ai-test', permissions })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(
      userRepo.create({ username: 'ai-tester', passwordHash, status: 1, roles: [role] })
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'ai-tester', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a model with encrypted key and mask it in responses', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/ai/admin/models')
      .set(auth())
      .send({
        modelKey: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        type: 'openai-compatible',
        baseUrl: 'https://api.deepseek.com/v1/',
        apiKey: 'sk-e2e-test-key-123456'
      })
      .expect(201);
    expect(created.body.data.apiKeyMask).toContain('****');
    expect(JSON.stringify(created.body.data)).not.toContain('sk-e2e-test-key-123456');
    expect(created.body.data.baseUrl).toBe('https://api.deepseek.com/v1'); // 尾部斜杠被去除
  });

  it('should allow same model_key from another baseUrl but dedupe exact endpoint', async () => {
    // 不同 baseUrl 的同名模型 = 多上游互备，允许。
    await request(app.getHttpServer())
      .post('/api/ai/admin/models')
      .set(auth())
      .send({
        modelKey: 'deepseek-chat',
        displayName: 'DeepSeek Chat（网关）',
        type: 'openai-compatible',
        baseUrl: 'https://gw.example.com/v1',
        apiKey: 'sk-another-key'
      })
      .expect(201);

    // 同 model_key + 同 baseUrl = 完全重复，拒绝。
    const duplicate = await request(app.getHttpServer())
      .post('/api/ai/admin/models')
      .set(auth())
      .send({
        modelKey: 'deepseek-chat',
        displayName: '重复端点',
        type: 'openai-compatible',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-dupe'
      })
      .expect(422); // BadRequest 统一映射 422
    expect(duplicate.body.message).toContain('已存在');
  });

  it('should keep api key when update sends empty apiKey', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/ai/admin/models')
      .set(auth())
      .expect(200);
    const target = list.body.data.find(
      (item: { modelKey: string; displayName: string }) => item.displayName === 'DeepSeek Chat'
    );
    const updated = await request(app.getHttpServer())
      .put(`/api/ai/admin/models/${target.id}`)
      .set(auth())
      .send({ displayName: 'DeepSeek Chat', apiKey: '' })
      .expect(200);
    expect(updated.body.data.apiKeyMask).toContain('****');
  });

  it('should require model for native agent and credentials for dify agent', async () => {
    await request(app.getHttpServer())
      .post('/api/ai/admin/agents')
      .set(auth())
      .send({ name: '缺模型的智能体', kind: 'native' })
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/ai/admin/agents')
      .set(auth())
      .send({ name: '缺端点的智能体', kind: 'dify' })
      .expect(422);
  });

  it('should submit chat then subscribe stream (fallback when no model)', async () => {
    const submitted = await request(app.getHttpServer())
      .post('/api/ai/chat/completions')
      .set(auth())
      .send({ content: '你好，介绍一下你自己' })
      .expect(201);
    const { conversationId, messageId } = submitted.body.data;
    expect(conversationId).toBeDefined();
    expect(messageId).toBeDefined();

    let raw = '';
    await request(app.getHttpServer())
      .get(`/api/ai/chat/stream/${messageId}`)
      .set(auth())
      .expect(200)
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => callback(null, raw));
      });
    // 无可用模型：应下发明确的业务错误事件而非 5xx。
    expect(raw).toContain('event: error');

    // 会话列表与消息可见。
    const conversations = await request(app.getHttpServer())
      .get('/api/ai/chat/conversations')
      .set(auth())
      .expect(200);
    expect(conversations.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should deny other user conversation access', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/ai/chat/conversations')
      .set(auth())
      .send({})
      .expect(201);

    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'ai-tester2', passwordHash, status: 1 }));
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'ai-tester2', password: 'password' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/ai/chat/conversations/${created.body.data.id}/messages`)
      .set({ Authorization: `Bearer ${login.body.data.accessToken}` })
      .expect(403);
  });
});
