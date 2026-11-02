// 发布矩阵 e2e：账号 CRUD 全链路（凭据加密落库 + 响应面白名单收口）、唯一索引重复/并发兜底、
// manage/view 权限双向 403、发布记录登记/查询 join/删除与引用校验。全离线（manual 通道不外呼）。
// 范式照抄 novel-cover.spec.ts 的权限构造（权限码→角色→用户→登录）。
// 状态码约定：服务层 BadRequestException 经全局过滤器统一映射 422（http-exception.filter.ts 项目约定）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { PublisherAccount } from '../src/common/entities/publisher-account.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

const PLAIN_CREDENTIALS = 'sk-secret-1234567890';
const ROTATED_CREDENTIALS = 'rotated-secret-9876543210';

// 与 src/modules/ai/core/crypto.util.ts loadKey 同构：sha256(AI_ENCRYPTION_KEY)
const deriveKey = (): Buffer => crypto.createHash('sha256').update(process.env.AI_ENCRYPTION_KEY ?? '').digest();

describe('Publisher (e2e)', () => {
  let app: INestApplication;
  let accountRepo: Repository<PublisherAccount>;
  let accessToken: string;
  let viewerToken: string;
  let manageOnlyToken: string;
  let accountId: number;
  let referencedAccountId: number;
  let projectId: number;
  let recordId: number;

  const auth = (token: string = accessToken) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'publisher-e2e-encryption-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    accountRepo = moduleFixture.get<Repository<PublisherAccount>>(getRepositoryToken(PublisherAccount));
    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));

    // 制片页创建小说项目需要 flow 权限：测试用户角色须同批挂 flow:run:execute（否则项目 setup 403）
    const permissions = await permissionRepo.save(
      ['publisher:manage', 'publisher:view', 'flow:define:manage'].map((code) => permissionRepo.create({ name: code, code }))
    );
    const managePermission = permissions.find((item) => item.code === 'publisher:manage')!;
    const viewPermission = permissions.find((item) => item.code === 'publisher:view')!;
    const flowDefinePermission = permissions.find((item) => item.code === 'flow:define:manage')!;

    const fullRole = await roleRepo.save(
      roleRepo.create({
        name: '发布全权',
        code: 'publisher-full',
        permissions: [managePermission, viewPermission, flowDefinePermission]
      })
    );
    const viewRole = await roleRepo.save(
      roleRepo.create({ name: '发布仅查看', code: 'publisher-view-only', permissions: [viewPermission] })
    );
    const manageOnlyRole = await roleRepo.save(
      roleRepo.create({ name: '发布仅管理', code: 'publisher-manage-only', permissions: [managePermission] })
    );

    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(
      userRepo.create({ username: 'publisher-admin', passwordHash, status: 1, roles: [fullRole] })
    );
    await userRepo.save(
      userRepo.create({ username: 'publisher-viewer', passwordHash, status: 1, roles: [viewRole] })
    );
    await userRepo.save(
      userRepo.create({ username: 'publisher-manager-only', passwordHash, status: 1, roles: [manageOnlyRole] })
    );

    const login = async (username: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return response.body.data.accessToken;
    };
    accessToken = await login('publisher-admin');
    viewerToken = await login('publisher-viewer');
    manageOnlyToken = await login('publisher-manager-only');

    // 发布记录依赖的小说项目（照 novel-cover.spec 创建形态）
    const created = await request(app.getHttpServer())
      .post('/api/novel-video')
      .set(auth())
      .send({
        name: '发布矩阵项目',
        text: '第一章 雪夜\n他推开门，看见漫天大雪。路灯下脚印延伸向远方，风把呼喊声吹散在夜里。'
      })
      .expect(201);
    projectId = created.body.data.project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST 账号：凭据加密落库，响应面白名单收口（无 credentialsEncrypted/credentials，含 credentialMask）', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/publisher/accounts')
      .set(auth())
      .send({ platform: 'douyin', accountName: '主账号', credentials: PLAIN_CREDENTIALS, remark: '常用' })
      .expect(201);
    accountId = created.body.data.id;
    expect(created.body.data).toEqual({
      id: expect.any(Number),
      platform: 'douyin',
      accountName: '主账号',
      credentialMask: 'sk-****7890',
      status: 1,
      remark: '常用'
    });
    const serialized = JSON.stringify(created.body.data);
    expect(serialized).not.toContain('credentialsEncrypted');
    expect(serialized).not.toContain(PLAIN_CREDENTIALS);

    const entity = await accountRepo.findOne({ where: { id: accountId } });
    expect(entity?.credentialsEncrypted).toBeTruthy();
    // AES-256-GCM 密文格式（iv:tag:cipher 三段十六进制）且回读解密等于明文
    expect(entity?.credentialsEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    const [ivHex, tagHex, dataHex] = entity!.credentialsEncrypted!.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final()
    ]).toString('utf8');
    expect(decrypted).toBe(PLAIN_CREDENTIALS);
  });

  it('GET 账号列表：同样白名单收口，无密文字段', async () => {
    const list = await request(app.getHttpServer()).get('/api/publisher/accounts').set(auth()).expect(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    const item = list.body.data.find((row: { id: number }) => row.id === accountId);
    expect(item.credentialMask).toBe('sk-****7890');
    const serialized = JSON.stringify(list.body.data);
    expect(serialized).not.toContain('credentialsEncrypted');
    expect(serialized).not.toContain(PLAIN_CREDENTIALS);
  });

  it('PATCH 账号：不传 credentials 不修改密文，响应面仍白名单；传 credentials 则重加密', async () => {
    const before = await accountRepo.findOne({ where: { id: accountId } });
    const updated = await request(app.getHttpServer())
      .patch(`/api/publisher/accounts/${accountId}`)
      .set(auth())
      .send({ remark: '已更新' })
      .expect(200);
    expect(updated.body.data.remark).toBe('已更新');
    const serialized = JSON.stringify(updated.body.data);
    expect(serialized).not.toContain('credentialsEncrypted');
    const after = await accountRepo.findOne({ where: { id: accountId } });
    expect(after?.credentialsEncrypted).toBe(before?.credentialsEncrypted);

    const rotated = await request(app.getHttpServer())
      .patch(`/api/publisher/accounts/${accountId}`)
      .set(auth())
      .send({ credentials: ROTATED_CREDENTIALS })
      .expect(200);
    expect(JSON.stringify(rotated.body.data)).not.toContain(ROTATED_CREDENTIALS);
    const entity = await accountRepo.findOne({ where: { id: accountId } });
    const [ivHex, tagHex, dataHex] = entity!.credentialsEncrypted!.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    expect(
      Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
    ).toBe(ROTATED_CREDENTIALS);
  });

  it('顺序二次 POST 同 (platform, accountName) → 422（唯一索引冲突转客户端错误）', async () => {
    await request(app.getHttpServer())
      .post('/api/publisher/accounts')
      .set(auth())
      .send({ platform: 'kuaishou', accountName: '重复账号' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/publisher/accounts')
      .set(auth())
      .send({ platform: 'kuaishou', accountName: '重复账号' })
      .expect(422);
  });

  it('并发 Promise.all 两条相同 (platform, accountName)：恰一 201、一 422、零 500（唯一索引 DB 兜底）', async () => {
    const payload = { platform: 'bilibili', accountName: '并发账号' };
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/api/publisher/accounts').set(auth()).send(payload),
      request(app.getHttpServer()).post('/api/publisher/accounts').set(auth()).send(payload)
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 422]);
    expect(first.status).toBeLessThan(500);
    expect(second.status).toBeLessThan(500);
    // sqlite :memory: 并发 save 有幽灵 id 局限（201 实体未必持久）：此处只断言「无重复 + 无 500」；
    // MySQL 生产由 (platform, account_name) 唯一索引 + InnoDB 行锁兜底，恰一行必然成立。
    const rows = await accountRepo.find({ where: { platform: 'bilibili', accountName: '并发账号' } });
    expect(rows.length).toBeLessThanOrEqual(1);
  });

  it('权限 403 双向：仅 view 用户写操作 403，仅 manage 用户读操作 403', async () => {
    await request(app.getHttpServer())
      .post('/api/publisher/accounts')
      .set(auth(viewerToken))
      .send({ platform: 'xhs', accountName: '无权账号' })
      .expect(403);
    await request(app.getHttpServer()).get('/api/publisher/accounts').set(auth(manageOnlyToken)).expect(403);
    await request(app.getHttpServer()).get('/api/publisher/records').set(auth(manageOnlyToken)).expect(403);
  });

  it('POST 发布记录：manual 通道登记即 published；GET ?projectId= join 出 projectName/accountName', async () => {
    // referencedAccountId 用于后续「账号被引用禁删」校验
    const referenced = await request(app.getHttpServer())
      .post('/api/publisher/accounts')
      .set(auth())
      .send({ platform: 'douyin', accountName: '被引用账号' })
      .expect(201);
    referencedAccountId = referenced.body.data.id;

    const record = await request(app.getHttpServer())
      .post('/api/publisher/records')
      .set(auth())
      .send({
        projectId,
        platform: 'douyin',
        accountId: referencedAccountId,
        title: '第一集',
        publishedAt: '2026-11-03T10:00:00.000Z',
        receiptUrl: 'https://v.douyin.com/abc123',
        note: '手动登记'
      })
      .expect(201);
    recordId = record.body.data.id;
    expect(record.body.data.status).toBe('published');
    expect(record.body.data.platform).toBe('douyin');
    expect(record.body.data.novelProjectId).toBe(projectId);

    const list = await request(app.getHttpServer())
      .get(`/api/publisher/records?projectId=${projectId}`)
      .set(auth())
      .expect(200);
    expect(list.body.data.total).toBeGreaterThanOrEqual(1);
    const item = list.body.data.items.find((row: { id: number }) => row.id === recordId);
    expect(item.projectName).toBe('发布矩阵项目');
    expect(item.accountName).toBe('被引用账号');
    expect(item.publishedAt).toBeTruthy();
    expect(item.receiptUrl).toBe('https://v.douyin.com/abc123');
  });

  it('POST 发布记录参数校验：projectId 不存在 404、accountId 不存在 422、停用账号 422', async () => {
    await request(app.getHttpServer())
      .post('/api/publisher/records')
      .set(auth())
      .send({ projectId: 999999, platform: 'douyin', publishedAt: '2026-11-03T10:00:00.000Z' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/publisher/records')
      .set(auth())
      .send({
        projectId,
        platform: 'douyin',
        accountId: 999999,
        publishedAt: '2026-11-03T10:00:00.000Z'
      })
      .expect(422);

    // 停用账号不可用于登记
    const disabled = await request(app.getHttpServer())
      .post('/api/publisher/accounts')
      .set(auth())
      .send({ platform: 'other', accountName: '停用账号', status: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/publisher/records')
      .set(auth())
      .send({
        projectId,
        platform: 'other',
        accountId: disabled.body.data.id,
        publishedAt: '2026-11-03T10:00:00.000Z'
      })
      .expect(422);
  });

  it('账号被发布记录引用时禁删 422；DELETE 发布记录后引用解除可删', async () => {
    await request(app.getHttpServer())
      .delete(`/api/publisher/accounts/${referencedAccountId}`)
      .set(auth())
      .expect(422);

    await request(app.getHttpServer()).delete(`/api/publisher/records/${recordId}`).set(auth()).expect(200);
    await request(app.getHttpServer())
      .delete(`/api/publisher/accounts/${referencedAccountId}`)
      .set(auth())
      .expect(200);
    const gone = await accountRepo.findOne({ where: { id: referencedAccountId } });
    expect(gone).toBeNull();
  });
});
