// 通知发布流程测试覆盖发布记录与重试逻辑。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/common/entities/user.entity';
import { Role } from '../../src/common/entities/role.entity';
import { Permission } from '../../src/common/entities/permission.entity';
import { NotificationTemplate } from '../../src/common/entities/notification-template.entity';
import { NotificationPublish } from '../../src/common/entities/notification-publish.entity';

describe('Notification Publish Flow (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let roleRepo: Repository<Role>;
  let permissionRepo: Repository<Permission>;
  let templateRepo: Repository<NotificationTemplate>;
  let publishRepo: Repository<NotificationPublish>;
  let userId = 0;

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
    await app.init();

    userRepo = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    roleRepo = moduleFixture.get<Repository<Role>>(getRepositoryToken(Role));
    permissionRepo = moduleFixture.get<Repository<Permission>>(getRepositoryToken(Permission));
    templateRepo = moduleFixture.get<Repository<NotificationTemplate>>(getRepositoryToken(NotificationTemplate));
    publishRepo = moduleFixture.get<Repository<NotificationPublish>>(getRepositoryToken(NotificationPublish));

    const permissions = await permissionRepo.save([
      permissionRepo.create({ name: '通知模板新增', code: 'system:notification:template:create' }),
      permissionRepo.create({ name: '通知发布列表', code: 'system:notification:publish:list' }),
      permissionRepo.create({ name: '通知发布重试', code: 'system:notification:publish:retry' })
    ]);
    const role = await roleRepo.save(
      roleRepo.create({ name: '通知管理员', code: 'notification_admin', permissions })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    const user = await userRepo.save(
      userRepo.create({ username: 'tester', nickname: '测试用户', passwordHash, status: 1, roles: [role] })
    );
    userId = user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should retry failed publish', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);

    const accessToken = loginResponse.body.data.accessToken;

    const template = await templateRepo.save(
      templateRepo.create({
        name: '重试模板',
        channelTypes: ['inbox'],
        content: '你好 {{var.userNickname}}',
        status: 1,
        variables: [
          { key: 'userNickname', label: '用户昵称', source: 'user', required: true }
        ]
      })
    );

    const publish = await publishRepo.save(
      publishRepo.create({
        templateId: template.id,
        channelType: 'inbox',
        payload: {
          recipients: [String(userId)],
          variables: {
            userNickname: '测试用户'
          },
          title: '重试测试'
        },
        status: 'failed',
        retryCount: 0,
        failReason: '模拟失败'
      })
    );

    const retryResponse = await request(app.getHttpServer())
      .post(`/api/notifications/publish/${publish.id}/retry`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: '手动重试' })
      .expect(201);

    expect(retryResponse.body.data.status).toBe('success');
    expect(retryResponse.body.data.retryCount).toBe(1);
  });
});
