// 通知模板渲染测试覆盖变量替换逻辑。
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
import { NotificationMessage } from '../../src/common/entities/notification-message.entity';

describe('Notification Template Render (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let roleRepo: Repository<Role>;
  let permissionRepo: Repository<Permission>;
  let messageRepo: Repository<NotificationMessage>;
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
    messageRepo = moduleFixture.get<Repository<NotificationMessage>>(getRepositoryToken(NotificationMessage));

    const permissions = await permissionRepo.save([
      permissionRepo.create({ name: '通知模板新增', code: 'system:notification:template:create' }),
      permissionRepo.create({ name: '通知发布新增', code: 'system:notification:publish:create' })
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

  it('should render template variables for inbox publish', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password' })
      .expect(201);

    const accessToken = loginResponse.body.data.accessToken;

    const templateResponse = await request(app.getHttpServer())
      .post('/api/notifications/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: '测试模板',
        channelTypes: ['inbox'],
        content: '你好 {{var.userNickname}}，事件：{{var.eventInfo}}。',
        status: 1
      })
      .expect(201);

    const templateId = templateResponse.body.data.id;

    const publishResponse = await request(app.getHttpServer())
      .post('/api/notifications/publish')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        templateId,
        channelType: 'inbox',
        recipients: [userId],
        variables: {
          eventInfo: '模板渲染测试'
        }
      })
      .expect(201);

    const publishId = publishResponse.body.data.id;
    const message = await messageRepo.findOne({ where: { publishId } });

    expect(message).toBeDefined();
    expect(message?.content).toContain('测试用户');
    expect(message?.content).toContain('模板渲染测试');
  });
});
