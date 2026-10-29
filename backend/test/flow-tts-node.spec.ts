// flow 引擎 tts 节点 e2e：start→tts→end 全链路（override 假 adapter 的 speech，落盘真实音频文件），
// 以及 modelId 指向不存在模型行时的失败路径。权限构造按 ai-admin.spec.ts:43-63 范式。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { encryptSecret } from '../src/modules/ai/core/crypto.util';
import { OpenAiCompatibleAdapter } from '../src/modules/ai/core/adapters/openai-compatible.adapter';
import { MP3_SILENT_500MS_BASE64 } from './fixtures/tts-fixtures';

describe('Flow tts node (e2e)', () => {
  let app: INestApplication;
  let modelRepo: Repository<AiModel>;
  let accessToken: string;
  const speechCaptures: Array<{ text: string; voice?: string; timeoutMs?: number }> = [];

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  const waitForTerminal = async (runId: number) => {
    const deadline = Date.now() + 20000;
    for (;;) {
      const res = await request(app.getHttpServer())
        .get(`/api/flows/runs/${runId}`)
        .set(auth())
        .expect(200);
      const status = res.body.data.run.status as string;
      if (['succeeded', 'failed', 'cancelled'].includes(status)) {
        return res.body.data;
      }
      if (Date.now() > deadline) {
        throw new Error(`运行 ${runId} 轮询超时，最后状态: ${status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

    // 假 TTS 适配器：记录入参（验证模板渲染/音色/超时透传），返回真实 mp3 fixture。
    const fakeAdapter = {
      type: 'openai-compatible',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async *chatStream(_messages: unknown, _options: unknown, _channel: unknown): AsyncGenerator<string> {
        yield '';
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async speech(options: { text: string; voice?: string; timeoutMs?: number }, _channel: unknown) {
        speechCaptures.push(options);
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
    const role = await roleRepo.save(roleRepo.create({ name: '流程配音', code: 'flow-tts', permissions }));
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'flow-tts', passwordHash, status: 1, roles: [role] }));
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'flow-tts', password: 'password' })
      .expect(201);
    accessToken = loginResponse.body.data.accessToken;

    modelRepo = moduleFixture.get<Repository<AiModel>>(getRepositoryToken(AiModel));
    const model = await modelRepo.save(
      modelRepo.create({
        modelKey: 'e2e-tts-node',
        displayName: 'E2E 节点配音模型',
        type: 'openai-compatible',
        baseUrl: 'https://upstream.invalid/v1',
        apiKeyCipher: encryptSecret('sk-e2e-node'),
        apiKeyMask: 'sk-****node',
        capabilities: 'tts',
        status: 1
      })
    );
    // 保存模型行 id 供失败用例引用不存在行（+99999 保证不撞）。
    process.env.E2E_TTS_MODEL_ID = String(model.id + 99999);
  });

  afterAll(async () => {
    await app.close();
  });

  const createFlowWithDag = async (ttsConfig: Record<string, unknown>): Promise<number> => {
    const flow = await request(app.getHttpServer())
      .post('/api/flows')
      .set(auth())
      .send({ name: `tts 流程-${Date.now()}` })
      .expect(201);
    const flowId = flow.body.data.id;
    await request(app.getHttpServer())
      .put(`/api/flows/${flowId}`)
      .set(auth())
      .send({
        dag: {
          nodes: [
            {
              id: 'start1',
              type: 'start',
              position: { x: 0, y: 0 },
              data: {
                name: '开始',
                config: { variables: [{ name: 'story', label: '旁白', defaultValue: '夜色渐深，路灯亮了。' }] }
              }
            },
            {
              id: 'tts1',
              type: 'tts',
              position: { x: 120, y: 0 },
              data: { name: '配音', config: { text: '{{start1.story}}', ...ttsConfig } }
            },
            {
              id: 'end1',
              type: 'end',
              position: { x: 240, y: 0 },
              data: {
                name: '输出',
                config: {
                  fields: [
                    { key: 'audioUrl', value: '{{tts1.url}}' },
                    { key: 'audioFile', value: '{{tts1.audioFile}}' }
                  ]
                }
              }
            }
          ],
          edges: [
            { id: 'e1', source: 'start1', target: 'tts1' },
            { id: 'e2', source: 'tts1', target: 'end1' }
          ]
        }
      })
      .expect(200);
    return flowId;
  };

  it('start→tts→end：轮询终态 succeeded，tts 节点输出 url/audioFile/chars/voice 且音频落盘', async () => {
    const flowId = await createFlowWithDag({ voice: 'e2e-voice' });
    const started = await request(app.getHttpServer())
      .post(`/api/flows/${flowId}/runs`)
      .set(auth())
      .send({})
      .expect(201);
    const runId = started.body.data.runId as number;

    const detail = await waitForTerminal(runId);
    expect(detail.run.status).toBe('succeeded');

    // tts 节点输出契约：{ url, audioFile, chars, voice }。
    const ttsNode = detail.nodes.find((node: { nodeType: string }) => node.nodeType === 'tts');
    expect(ttsNode.status).toBe('succeeded');
    expect(ttsNode.output.url).toMatch(/^\/uploads\/tts\/tts1-\d+\.mp3$/);
    expect(ttsNode.output.audioFile).toMatch(/^tts\/tts1-\d+\.mp3$/);
    expect(ttsNode.output.chars).toBe('夜色渐深，路灯亮了。'.length);
    expect(ttsNode.output.voice).toBe('e2e-voice');

    // end 汇总字段经 {{tts1.*}} 渲染进 run.outputs。
    expect(detail.run.outputs.audioUrl).toBe(ttsNode.output.url);
    expect(detail.run.outputs.audioFile).toBe(ttsNode.output.audioFile);

    // 文件真实落盘且内容与 fixture 一致（假上游直返 fixture base64）。
    const absolute = join(process.cwd(), 'uploads', ttsNode.output.audioFile);
    expect(existsSync(absolute)).toBe(true);
    expect(readFileSync(absolute).toString('base64')).toBe(MP3_SILENT_500MS_BASE64);

    // 模板渲染与超时默认值透传（TTS_TIMEOUT_MS 未配置 → 60000）。
    expect(speechCaptures[speechCaptures.length - 1].text).toBe('夜色渐深，路灯亮了。');
    expect(speechCaptures[speechCaptures.length - 1].timeoutMs).toBe(60000);
  });

  it('modelId 指向不存在模型行：无候选故障转移，run 失败且错误信息明确', async () => {
    const flowId = await createFlowWithDag({ modelId: Number(process.env.E2E_TTS_MODEL_ID) });
    const started = await request(app.getHttpServer())
      .post(`/api/flows/${flowId}/runs`)
      .set(auth())
      .send({})
      .expect(201);
    const runId = started.body.data.runId as number;

    const detail = await waitForTerminal(runId);
    expect(detail.run.status).toBe('failed');
    expect(detail.run.error).toContain('没有可用的语音合成模型');
    const ttsNode = detail.nodes.find((node: { nodeType: string }) => node.nodeType === 'tts');
    expect(ttsNode.status).toBe('failed');
    // 下游 end 节点应被标记 skipped（引擎失败语义）。
    const endNode = detail.nodes.find((node: { nodeType: string }) => node.nodeType === 'end');
    expect(endNode.status).toBe('skipped');
  });
});
