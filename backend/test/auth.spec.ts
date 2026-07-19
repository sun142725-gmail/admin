// Auth 模块测试覆盖登录、刷新与守卫。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../src/common/entities/user.entity';
import { Role } from '../src/common/entities/role.entity';
import { Permission } from '../src/common/entities/permission.entity';
import { UserIdentifier } from '../src/common/entities/user-identifier.entity';
import { AuthService } from '../src/modules/auth/auth.service';
import { VerificationCodeService } from '../src/modules/auth/verification-code.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let roleRepo: Repository<Role>;
  let permissionRepo: Repository<Permission>;
  let identifierRepo: Repository<UserIdentifier>;
  let authService: AuthService;
  let verificationCodeService: VerificationCodeService;

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
    identifierRepo = moduleFixture.get<Repository<UserIdentifier>>(getRepositoryToken(UserIdentifier));
    authService = moduleFixture.get(AuthService);
    verificationCodeService = moduleFixture.get(VerificationCodeService);

    const permission = await permissionRepo.save(
      permissionRepo.create({ name: '用户列表', code: 'system:user:list' })
    );
    const role = await roleRepo.save(
      roleRepo.create({ name: '测试角色', code: 'tester', permissions: [permission] })
    );
    const passwordHash = await bcrypt.hash('password', 10);
    await userRepo.save(
      userRepo.create({ username: 'admin', passwordHash, status: 1, roles: [role] })
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('should login and return tokens', async () => {
    const response = await authService.login('admin', 'password');
    expect(response.accessToken).toBeDefined();
    expect(response.refreshToken).toBeDefined();
  });

  it('should refresh token', async () => {
    const loginResponse = await authService.login('admin', 'password');
    const refreshResponse = await authService.refresh(loginResponse.refreshToken);
    expect(refreshResponse.accessToken).toBeDefined();
  });

  it('should send code and login by sms code', async () => {
    const sendResponse = await verificationCodeService.sendCode('login', 'sms', '13800138000');
    const loginResponse = await authService.codeLogin('sms', '13800138000', sendResponse.code!);
    expect(loginResponse.accessToken).toBeDefined();

    const identifier = await identifierRepo.findOne({
      where: { identifierType: 'sms', identifierValue: '13800138000' },
      relations: ['user']
    });
    expect(identifier?.user).toBeDefined();
  });

  it('should login existing sms user without duplicate registration', async () => {
    const beforeCount = await identifierRepo.count({
      where: { identifierType: 'sms', identifierValue: '13800138000' }
    });
    const sendResponse = await verificationCodeService.sendCode('login', 'sms', '13800138000');

    const loginResponse = await authService.codeLogin('sms', '13800138000', sendResponse.code!);

    const afterCount = await identifierRepo.count({
      where: { identifierType: 'sms', identifierValue: '13800138000' }
    });
    expect(loginResponse.accessToken).toBeDefined();
    expect(afterCount).toBe(beforeCount);
  });

  it('should reset password by sms code', async () => {
    const identifier = await identifierRepo.findOne({
      where: { identifierType: 'sms', identifierValue: '13800138000' },
      relations: ['user']
    });
    expect(identifier?.user).toBeDefined();

    const sendResponse = await verificationCodeService.sendCode(
      'reset_password',
      'sms',
      '13800138000'
    );

    await authService.codeResetPassword(
      'sms',
      '13800138000',
      sendResponse.code!,
      'newPassword123'
    );

    const user = await userRepo.findOne({ where: { id: identifier!.userId } });
    expect(user).toBeDefined();

    const loginResponse = await authService.login(user!.username, 'newPassword123');
    expect(loginResponse.accessToken).toBeDefined();
  });
});
