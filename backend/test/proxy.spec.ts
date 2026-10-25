// 微服务转发链路测试：本地起一个假上游服务，验证注册表查询、JSON 透传（不被二次包装）、
// POST 请求体转发、SSE 流式透传，以及"未注册服务 404 / 上游不可达 502"两个错误分支。
import { Test } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as http from 'node:http';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

jest.setTimeout(30000);

describe('Proxy 微服务转发 (e2e)', () => {
  let app: INestApplication;
  let upstream: http.Server;
  let upstreamPort: number;
  let savedEnv: Record<string, string | undefined>;
  const seen: Array<{ method: string; url: string; body: string; headers: http.IncomingHttpHeaders }> = [];

  beforeAll(async () => {
    // 记录原始值，afterAll 恢复：--runInBand 下 env 会泄漏到同进程的其它 spec
    const envKeys = ['NODE_ENV', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_ACCESS_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN', 'SEED'] as const;
    savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';

    // 假上游：记录收到的请求，按路径返回 JSON / SSE / 404
    upstream = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        seen.push({ method: req.method as string, url: req.url as string, body: raw, headers: req.headers });
        if (req.method === 'GET' && req.url === '/api/v1/examples') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ code: 0, message: 'success', data: { items: [{ id: 1, name: '示例一' }] } }));
        } else if (req.method === 'POST' && req.url === '/api/v1/examples') {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ code: 0, message: 'success', data: JSON.parse(raw || '{}') }));
        } else if (req.method === 'GET' && req.url === '/api/v1/examples/1/stream') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          let count = 0;
          const timer = setInterval(() => {
            count += 1;
            res.write(`data: 事件${count}\n\n`);
            if (count >= 3) {
              clearInterval(timer);
              res.end();
            }
          }, 30);
        } else {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ code: 404, message: 'not found', data: null }));
        }
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamPort = (upstream.address() as import('node:net').AddressInfo).port;
    process.env.PROXY_CORE_TARGET = `http://127.0.0.1:${upstreamPort}/api/v1`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          // 测试直接注入用户，绕开真实 JWT 校验（转发器只依赖 req.user 做审计）
          ctx.switchToHttp().getRequest().user = { id: 1, username: 'tester', permissions: [], roles: [] };
          return true;
        }
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    delete process.env.PROXY_CORE_TARGET;
  });

  it('GET /api/svc 返回服务注册表（统一包装结构）', async () => {
    const res = await request(app.getHttpServer()).get('/api/svc').expect(200);
    expect(res.body.code).toBe(0);
    const core = res.body.data.find((item: { name: string }) => item.name === 'core');
    expect(core).toBeDefined();
    expect(core.prefix).toBe('/api/svc/core');
    expect(core.target).toContain(`127.0.0.1:${upstreamPort}`);
  });

  it('GET /api/svc/core/examples 原样透传上游 JSON（不被二次包装）', async () => {
    const res = await request(app.getHttpServer()).get('/api/svc/core/examples').expect(200);
    expect(res.body).toEqual({ code: 0, message: 'success', data: { items: [{ id: 1, name: '示例一' }] } });
    // 上游收到的是基路径改写后的地址，且带上了转发用户标识
    const last = seen[seen.length - 1];
    expect(last.url).toBe('/api/v1/examples');
    expect(String(last.headers['x-forwarded-user'])).toBe('1');
  });

  it('POST /api/svc/core/examples 转发 JSON 请求体并回显', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/svc/core/examples')
      .send({ name: '新示例', remark: '转发体测试' })
      .expect(201);
    expect(res.body.data).toEqual({ name: '新示例', remark: '转发体测试' });
    const last = seen[seen.length - 1];
    expect(last.method).toBe('POST');
    expect(last.url).toBe('/api/v1/examples');
    expect(String(last.headers['content-type'])).toContain('application/json');
    expect(JSON.parse(last.body)).toEqual({ name: '新示例', remark: '转发体测试' });
  });

  it('GET /api/svc/core/examples/1/stream 流式透传 SSE', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/svc/core/examples/1/stream')
      .parse((raw, callback) => {
        // SSE 非 superagent 默认可解析类型，手动按文本收集
        let text = '';
        raw.on('data', (chunk) => (text += chunk));
        raw.on('end', () => callback(null, text));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(String(res.body).match(/data:/g)).toHaveLength(3);
  });

  it('GET /api/svc/ghost/xxx 未注册服务返回 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/svc/ghost/xxx').expect(404);
    expect(res.body.message).toContain('未注册的微服务');
  });

  it('上游不可达时返回 502', async () => {
    const saved = process.env.PROXY_CORE_TARGET;
    process.env.PROXY_CORE_TARGET = 'http://127.0.0.1:1/api/v1';
    try {
      const res = await request(app.getHttpServer()).get('/api/svc/core/examples').expect(502);
      expect(res.body.message).toContain('不可达');
    } finally {
      process.env.PROXY_CORE_TARGET = saved;
    }
  });
});
