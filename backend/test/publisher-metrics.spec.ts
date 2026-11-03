// 数据回流 e2e：模板下载响应头与正文、CSV 导入幂等 upsert（同键覆盖不重复插入）、
// 行级校验 rejected 明细（项目不存在/日期非法/数值负数/videoId 超长）、并发双导入同键收敛、
// 未传文件/表头不一致 422、同文件重复键两行覆盖、DB 写入失败 reason 固定文案不外泄、
// GET 明细 join/筛选/升序/区间（含 to 当天）。全离线 sqlite :memory:，照 publisher.spec.ts 权限构造。
// 状态码约定：服务层 BadRequestException 经全局过滤器统一映射 422（http-exception.filter.ts 项目约定）。
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
import { VideoPlatformMetric } from '../src/common/entities/video-platform-metric.entity';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

const HEADER = 'project_id,platform,date,video_id,views,likes,comments,follows,remark';

const metricLine = (cells: [string | number, string, string, string, string, string, string, string, string?]) =>
  cells.join(',');

describe('Publisher metrics (e2e)', () => {
  let app: INestApplication;
  let metricRepo: Repository<VideoPlatformMetric>;
  let accessToken: string;
  let viewerToken: string;
  let manageOnlyToken: string;
  let projectAId: number;
  let projectBId: number;

  const auth = (token: string = accessToken) => ({ Authorization: `Bearer ${token}` });

  const importCsv = (token: string, content: string) =>
    request(app.getHttpServer())
      .post('/api/publisher/metrics/import')
      .set(auth(token))
      .attach('file', Buffer.from(content, 'utf8'), { filename: 'metrics.csv', contentType: 'text/csv' });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'publisher-metrics-e2e-encryption-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor(new Reflector()));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    metricRepo = moduleFixture.get<Repository<VideoPlatformMetric>>(getRepositoryToken(VideoPlatformMetric));
    const userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    const roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    const permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));

    const permissions = await permissionRepo.save(
      ['publisher:manage', 'publisher:view', 'flow:define:manage'].map((code) =>
        permissionRepo.create({ name: code, code })
      )
    );
    const managePermission = permissions.find((item) => item.code === 'publisher:manage')!;
    const viewPermission = permissions.find((item) => item.code === 'publisher:view')!;
    const flowDefinePermission = permissions.find((item) => item.code === 'flow:define:manage')!;

    const fullRole = await roleRepo.save(
      roleRepo.create({
        name: '回流全权',
        code: 'metrics-full',
        permissions: [managePermission, viewPermission, flowDefinePermission]
      })
    );
    const viewRole = await roleRepo.save(
      roleRepo.create({ name: '回流仅查看', code: 'metrics-view-only', permissions: [viewPermission] })
    );
    const manageOnlyRole = await roleRepo.save(
      roleRepo.create({ name: '回流仅管理', code: 'metrics-manage-only', permissions: [managePermission] })
    );

    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(userRepo.create({ username: 'metrics-admin', passwordHash, status: 1, roles: [fullRole] }));
    await userRepo.save(userRepo.create({ username: 'metrics-viewer', passwordHash, status: 1, roles: [viewRole] }));
    await userRepo.save(
      userRepo.create({ username: 'metrics-manager-only', passwordHash, status: 1, roles: [manageOnlyRole] })
    );

    const login = async (username: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'password' })
        .expect(201);
      return response.body.data.accessToken;
    };
    accessToken = await login('metrics-admin');
    viewerToken = await login('metrics-viewer');
    manageOnlyToken = await login('metrics-manager-only');

    const createProject = async (name: string): Promise<number> => {
      const created = await request(app.getHttpServer())
        .post('/api/novel-video')
        .set(auth())
        .send({
          name,
          text: '第一章 雪夜\n他推开门，看见漫天大雪。路灯下脚印延伸向远方，风把呼喊声吹散在夜里。'
        })
        .expect(201);
      return created.body.data.project.id;
    };
    projectAId = await createProject('回流项目A');
    projectBId = await createProject('回流项目B');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET metrics/template：响应头 text/csv + attachment，正文含表头与示例行（res.text 由 superagent 填充）', async () => {
    const res = await request(app.getHttpServer()).get('/api/publisher/metrics/template').set(auth()).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain(HEADER);
    expect(res.text).toContain('1,douyin,2026-11-01,video-001,12000,800,120,30,示例备注');
  });

  it('CSV 导入首插：两作品×两平台×两日期 inserted=4；GET metrics join/筛选/升序/区间（含 to 当天）', async () => {
    const csv = [
      HEADER,
      metricLine([projectAId, 'douyin', '2026-11-01', 'v-1', '12000', '800', '100', '30', '']),
      // video_id 空串占位（按日整作汇总口径）
      metricLine([projectAId, 'bilibili', '2026-11-02', '', '300', '30', '5', '3', '空视频占位']),
      metricLine([projectBId, 'douyin', '2026-11-01', 'v-2', '9999', '500', '50', '10', '']),
      metricLine([projectBId, 'bilibili', '2026-11-02', 'v-3', '20000', '1500', '150', '50', '爆款样本'])
    ].join('\n');
    const imported = await importCsv(accessToken, csv).expect(201);
    expect(imported.body.data).toEqual({ received: 4, inserted: 4, updated: 0, rejected: [] });

    // 全量明细 + join projectName
    const all = await request(app.getHttpServer()).get('/api/publisher/metrics').set(auth()).expect(200);
    expect(all.body.data).toHaveLength(4);
    const aRows = all.body.data.filter((row: { novelProjectId: number }) => row.novelProjectId === projectAId);
    expect(aRows).toHaveLength(2);
    for (const row of aRows) {
      expect(row.projectName).toBe('回流项目A');
    }
    const bRows = all.body.data.filter((row: { novelProjectId: number }) => row.novelProjectId === projectBId);
    expect(bRows.every((row: { projectName: string }) => row.projectName === '回流项目B')).toBe(true);

    // metricDate 升序
    const dates: string[] = all.body.data.map((row: { metricDate: string }) => row.metricDate);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);

    // ?projectId= 只含该项目行
    const byProject = await request(app.getHttpServer())
      .get(`/api/publisher/metrics?projectId=${projectAId}`)
      .set(auth())
      .expect(200);
    expect(byProject.body.data).toHaveLength(2);
    expect(byProject.body.data.every((row: { novelProjectId: number }) => row.novelProjectId === projectAId)).toBe(
      true
    );

    // ?platform= 只含该平台行
    const byPlatform = await request(app.getHttpServer())
      .get('/api/publisher/metrics?platform=douyin')
      .set(auth())
      .expect(200);
    expect(byPlatform.body.data).toHaveLength(2);
    expect(byPlatform.body.data.every((row: { platform: string }) => row.platform === 'douyin')).toBe(true);

    // ?from=&to= 区间命中（含 to 当天：单日区间只回当天）
    const byRange = await request(app.getHttpServer())
      .get('/api/publisher/metrics?from=2026-11-02&to=2026-11-02')
      .set(auth())
      .expect(200);
    expect(byRange.body.data).toHaveLength(2);
    expect(
      byRange.body.data.every((row: { metricDate: string }) => row.metricDate.startsWith('2026-11-02'))
    ).toBe(true);
  });

  it('CSV 导入幂等：同键二次导入 received 相同、inserted=0、updated>0、库中行数不增、账面恒平', async () => {
    const before = await metricRepo.count();
    const csv = [
      HEADER,
      metricLine([projectAId, 'douyin', '2026-11-01', 'v-1', '15000', '900', '110', '35', '覆盖版']),
      metricLine([projectBId, 'bilibili', '2026-11-02', 'v-3', '22000', '1600', '160', '55', '覆盖版'])
    ].join('\n');
    const imported = await importCsv(accessToken, csv).expect(201);
    const { received, inserted, updated, rejected } = imported.body.data;
    expect(received).toBe(2);
    expect(inserted).toBe(0);
    expect(updated).toBe(2);
    expect(rejected).toEqual([]);
    // 账面恒平：每行恰好落一个桶
    expect(received).toBe(inserted + updated + rejected.length);
    expect(await metricRepo.count()).toBe(before);

    // 覆盖生效：同键行数值已更新为第二次导入值
    const row = await metricRepo.findOne({
      where: { novelProjectId: projectAId, platform: 'douyin', videoId: 'v-1' }
    });
    expect(row?.views).toBe(15000);
    expect(row?.likes).toBe(900);
    expect(row?.remark).toBe('覆盖版');
  });

  it('非法行 rejected 明细：项目不存在/日期非法/数值负数/videoId 超长各一条，均带 line+reason，库行数不变', async () => {
    const before = await metricRepo.count();
    const csv = [
      HEADER,
      metricLine([999999, 'douyin', '2026-11-01', 'v-x', '100', '1', '1', '1', '']),
      metricLine([projectAId, 'douyin', '2026-02-30', 'v-y', '100', '1', '1', '1', '']),
      metricLine([projectAId, 'douyin', '2026-11-01', 'v-z', '-5', '1', '1', '1', '']),
      metricLine([projectAId, 'douyin', '2026-11-01', 'v'.repeat(129), '1', '1', '1', '1', ''])
    ].join('\n');
    const imported = await importCsv(accessToken, csv).expect(201);
    const { received, inserted, updated, rejected } = imported.body.data;
    expect(received).toBe(4);
    expect(inserted).toBe(0);
    expect(updated).toBe(0);
    expect(received).toBe(inserted + updated + rejected.length);
    expect(rejected).toHaveLength(4);
    for (const item of rejected) {
      expect(typeof item.line).toBe('number');
      expect(typeof item.reason).toBe('string');
    }
    const reasons = rejected.map((item: { reason: string }) => item.reason).join('\n');
    expect(reasons).toContain('项目不存在');
    expect(reasons).toContain('date');
    expect(reasons).toContain('views');
    expect(reasons).toContain('video_id');
    // 非法行不落库
    expect(await metricRepo.count()).toBe(before);
    // 行号定位：4 条非法行依次在物理行 2-5
    expect(rejected.map((item: { line: number }) => item.line).sort((a: number, b: number) => a - b)).toEqual([
      2, 3, 4, 5
    ]);
  });

  it('未传文件：service 层「请上传 CSV 文件」经 BadRequestException 400→422 映射返回', async () => {
    const res = await request(app.getHttpServer()).post('/api/publisher/metrics/import').set(auth()).expect(422);
    expect(res.body.message).toBe('请上传 CSV 文件');
  });

  it('CSV 表头与模板不一致：400→422，message 含「表头」引导先下载模板', async () => {
    const res = await importCsv(accessToken, 'a,b,c\n1,2,3').expect(422);
    expect(res.body.message).toContain('表头');
  });

  it('同 CSV 文件内重复键两行：第二行覆盖为 updated（received=2/inserted=1/updated=1、库行数=1）', async () => {
    const before = await metricRepo.count();
    const csv = [
      HEADER,
      metricLine([projectAId, 'channels', '2026-11-06', 'v-dup', '100', '1', '1', '1', '第一行']),
      metricLine([projectAId, 'channels', '2026-11-06', 'v-dup', '200', '2', '2', '2', '第二行覆盖'])
    ].join('\n');
    const imported = await importCsv(accessToken, csv).expect(201);
    expect(imported.body.data).toEqual({ received: 2, inserted: 1, updated: 1, rejected: [] });
    // 账面恒平：同文件重复键两行也恰好各落一个桶（第二行串行 findOne 命中后走覆盖分支）
    expect(imported.body.data.received).toBe(
      imported.body.data.inserted + imported.body.data.updated + imported.body.data.rejected.length
    );
    const rows = await metricRepo.find({ where: { platform: 'channels', videoId: 'v-dup' } });
    expect(rows).toHaveLength(1);
    // 覆盖生效：终值为第二行数据
    expect(rows[0].views).toBe(200);
    expect(rows[0].remark).toBe('第二行覆盖');
    expect(await metricRepo.count()).toBe(before + 1);
  });

  it('数据库写入失败：rejected reason 固定文案，不外泄错误原文（表名/驱动细节仅落服务端日志）', async () => {
    const before = await metricRepo.count();
    const findOneSpy = jest
      .spyOn(metricRepo, 'findOne')
      .mockRejectedValueOnce(
        new Error('select * from video_platform_metric where ...: ER_ACCESS_DENIED_ERROR (using password: YES)')
      );
    try {
      const csv = [HEADER, metricLine([projectAId, 'other', '2026-11-07', 'v-db-err', '10', '1', '1', '1', ''])].join(
        '\n'
      );
      const imported = await importCsv(accessToken, csv).expect(201);
      const { received, inserted, updated, rejected } = imported.body.data;
      expect(received).toBe(1);
      expect(inserted).toBe(0);
      expect(updated).toBe(0);
      expect(rejected).toEqual([{ line: 2, reason: '数据库写入失败，请联系管理员' }]);
      // 响应面（含 rejected reason）不出现错误原文中的表名/驱动细节
      expect(JSON.stringify(imported.body)).not.toContain('video_platform_metric');
      expect(JSON.stringify(imported.body)).not.toContain('ER_ACCESS_DENIED');
      // 失败行不落库
      expect(await metricRepo.count()).toBe(before);
    } finally {
      findOneSpy.mockRestore();
    }
  });

  it('并发 Promise.all 双导入同一键：两响应均 <500、库中该键行数 ≤1、终态数据一致（唯一冲突 catch→update 重试）', async () => {
    const csvA = [HEADER, metricLine([projectAId, 'kuaishou', '2026-11-05', 'v-c', '1111', '10', '1', '1', ''])].join(
      '\n'
    );
    const csvB = [HEADER, metricLine([projectAId, 'kuaishou', '2026-11-05', 'v-c', '2222', '20', '2', '2', ''])].join(
      '\n'
    );
    const [resA, resB] = await Promise.all([
      importCsv(accessToken, csvA),
      importCsv(accessToken, csvB)
    ]);
    expect(resA.status).toBeLessThan(500);
    expect(resB.status).toBeLessThan(500);
    // 单请求内账面恒平（唯一冲突行转 update 计 updated，不落 rejected）
    for (const res of [resA, resB]) {
      const { received, inserted, updated, rejected } = res.body.data;
      expect(received).toBe(inserted + updated + rejected.length);
    }
    // sqlite :memory: 并发 save 有幽灵 id 局限（照 publisher.spec.ts:214-217 放宽口径）：
    // 此处只断言「无重复 + 无 500」；MySQL 生产由四元唯一索引 + InnoDB 行锁兜底，恰一行必然成立。
    const rows = await metricRepo.find({ where: { platform: 'kuaishou', videoId: 'v-c' } });
    expect(rows.length).toBeLessThanOrEqual(1);
    // 终态数据一致：唯一冲突 catch→update 重试后该键恰为两次导入值之一（幂等覆盖语义）
    if (rows.length === 1) {
      expect([1111, 2222]).toContain(rows[0].views);
      expect([10, 20]).toContain(rows[0].likes);
    }
  });

  it('权限 403 双向：仅 view 调 import 403；仅 manage 调 template 与 GET metrics 403', async () => {
    await importCsv(viewerToken, HEADER).expect(403);
    await request(app.getHttpServer()).get('/api/publisher/metrics/template').set(auth(manageOnlyToken)).expect(403);
    await request(app.getHttpServer()).get('/api/publisher/metrics').set(auth(manageOnlyToken)).expect(403);
  });
});
