// 初始化数据服务用于生成默认账号与权限。
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../common/entities/user.entity';
import { Role } from '../../common/entities/role.entity';
import { Permission } from '../../common/entities/permission.entity';
import { Resource } from '../../common/entities/resource.entity';
import { Dict } from '../../common/entities/dict.entity';
import { DictItem } from '../../common/entities/dict-item.entity';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(Dict)
    private readonly dictRepo: Repository<Dict>,
    @InjectRepository(DictItem)
    private readonly dictItemRepo: Repository<DictItem>
  ) {}

  async onModuleInit() {
    if (process.env.SEED !== 'true') {
      return;
    }
    const userCount = await this.userRepo.count();
    if (userCount > 0) {
      await this.ensureDashboardSetup();
      await this.ensureDivinationSetup();
      await this.ensureProfileAndAuditCenter();
      await this.ensureDictSetup();
      await this.ensureNotificationSetup();
      return;
    }

    const permissions = await this.seedPermissions();
    const role = await this.seedAdminRole(permissions);
    await this.seedResources();
    await this.seedAdminUser(role);
    await this.ensureDictSetup();
    await this.ensureNotificationSetup();
    this.logger.log('初始化数据已完成');
  }

  private async seedPermissions() {
    const items: Array<Partial<Permission>> = [
      { name: '用户列表', code: 'system:user:list' },
      { name: '新增用户', code: 'system:user:create' },
      { name: '编辑用户', code: 'system:user:update' },
      { name: '禁用用户', code: 'system:user:disable' },
      { name: '删除用户', code: 'system:user:delete' },
      { name: '重置密码', code: 'system:user:reset' },
      { name: '分配角色', code: 'system:user:assign' },
      { name: '角色列表', code: 'system:role:list' },
      { name: '新增角色', code: 'system:role:create' },
      { name: '编辑角色', code: 'system:role:update' },
      { name: '删除角色', code: 'system:role:delete' },
      { name: '分配权限', code: 'system:role:assign' },
      { name: '角色用户', code: 'system:role:users' },
      { name: '权限列表', code: 'system:permission:list' },
      { name: '新增权限', code: 'system:permission:create' },
      { name: '编辑权限', code: 'system:permission:update' },
      { name: '删除权限', code: 'system:permission:delete' },
      { name: '资源新增', code: 'system:resource:create' },
      { name: '资源更新', code: 'system:resource:update' },
      { name: '资源删除', code: 'system:resource:delete' },
      { name: '首页监控', code: 'system:dashboard:view' },
      { name: '审计日志', code: 'system:audit:list' },
      { name: '日志中心', code: 'system:audit:center' },
      { name: '字典列表', code: 'system:dict:list' },
      { name: '新增字典', code: 'system:dict:create' },
      { name: '编辑字典', code: 'system:dict:update' },
      { name: '删除字典', code: 'system:dict:delete' },
      { name: '个人中心查看', code: 'system:profile:view' },
      { name: '个人中心更新', code: 'system:profile:update' },
      { name: '个人中心改密', code: 'system:profile:password' },
      { name: '个人中心头像', code: 'system:profile:avatar' },
      { name: '占卜入口', code: 'system:divination:use' },
      { name: '通知模板列表', code: 'system:notification:template:list' },
      { name: '新增通知模板', code: 'system:notification:template:create' },
      { name: '编辑通知模板', code: 'system:notification:template:update' },
      { name: '删除通知模板', code: 'system:notification:template:delete' },
      { name: '通知发布列表', code: 'system:notification:publish:list' },
      { name: '通知发布发送', code: 'system:notification:publish:create' },
      { name: '通知发布重试', code: 'system:notification:publish:retry' },
      { name: '站内信收件箱', code: 'system:notification:inbox:list' },
      { name: '站内信已读', code: 'system:notification:inbox:read' }
    ];
    const entities = this.permissionRepo.create(items);
    return this.permissionRepo.save(entities);
  }

  private async seedAdminRole(permissions: Permission[]) {
    const role = this.roleRepo.create({
      name: '管理员',
      code: 'admin',
      description: '系统管理员',
      permissions
    });
    return this.roleRepo.save(role);
  }

  private async seedResources() {
    const system = await this.resourceRepo.save(
      this.resourceRepo.create({
        name: '系统管理',
        type: 'menu',
        sortOrder: 1
      })
    );
    const config = await this.resourceRepo.save(
      this.resourceRepo.create({
        name: '系统配置',
        type: 'menu',
        sortOrder: 2
      })
    );
    const logs = await this.resourceRepo.save(
      this.resourceRepo.create({
        name: '日志管理',
        type: 'menu',
        sortOrder: 3
      })
    );
    const tools = await this.resourceRepo.save(
      this.resourceRepo.create({
        name: '工具',
        type: 'menu',
        sortOrder: 4
      })
    );

    const children = [
      { name: '系统首页', type: 'page', path: '/', parentId: system.id, permissionCode: 'system:dashboard:view' },
      { name: '用户管理', type: 'page', path: '/users', parentId: system.id, permissionCode: 'system:user:list' },
      { name: '角色管理', type: 'page', path: '/roles', parentId: system.id, permissionCode: 'system:role:list' },
      { name: '权限管理', type: 'page', path: '/permissions', parentId: system.id, permissionCode: 'system:permission:list' },
      { name: '六爻占卜', type: 'page', path: '/divination', parentId: tools.id, permissionCode: 'system:divination:use' },
      { name: '字典管理', type: 'page', path: '/dicts', parentId: config.id, permissionCode: 'system:dict:list' },
      { name: '通知模板', type: 'page', path: '/notifications/templates', parentId: config.id, permissionCode: 'system:notification:template:list' },
      { name: '通知发布', type: 'page', path: '/notifications/publish', parentId: config.id, permissionCode: 'system:notification:publish:list' },
      { name: '站内信', type: 'page', path: '/notifications/inbox', parentId: config.id, permissionCode: 'system:notification:inbox:list' },
      { name: '审计日志', type: 'page', path: '/logs/audit', parentId: logs.id, permissionCode: 'system:audit:list' },
      { name: '打点日志', type: 'page', path: '/logs/track', parentId: logs.id, permissionCode: 'system:audit:center' },
      { name: '前端日志', type: 'page', path: '/logs/frontend', parentId: logs.id, permissionCode: 'system:audit:center' },
      { name: '错误日志', type: 'page', path: '/logs/error', parentId: logs.id, permissionCode: 'system:audit:center' }
    ];
    await this.resourceRepo.save(this.resourceRepo.create(children));
  }

  private async ensureDivinationSetup() {
    const permission = await this.ensurePermission();
    await this.ensureDivinationResource(permission?.code);
    if (permission) {
      await this.ensureAdminRolePermission(permission);
    }
  }

  private async ensureProfileAndAuditCenter() {
    const permissions = [
      { name: '首页监控', code: 'system:dashboard:view' },
      { name: '审计日志', code: 'system:audit:list' },
      { name: '日志中心', code: 'system:audit:center' },
      { name: '个人中心查看', code: 'system:profile:view' },
      { name: '个人中心更新', code: 'system:profile:update' },
      { name: '个人中心改密', code: 'system:profile:password' },
      { name: '个人中心头像', code: 'system:profile:avatar' }
    ];
    for (const item of permissions) {
      const permission = await this.ensurePermissionByCode(item.code, item.name);
      await this.ensureAdminRolePermission(permission);
    }
    await this.ensureLogPages();
  }

  private async ensureDashboardSetup() {
    const permission = await this.ensurePermissionByCode('system:dashboard:view', '首页监控');
    await this.ensureAdminRolePermission(permission);
    await this.ensureDashboardResource();
  }

  private async ensureDictSetup() {
    const permissions = [
      { name: '字典列表', code: 'system:dict:list' },
      { name: '新增字典', code: 'system:dict:create' },
      { name: '编辑字典', code: 'system:dict:update' },
      { name: '删除字典', code: 'system:dict:delete' }
    ];
    for (const item of permissions) {
      const permission = await this.ensurePermissionByCode(item.code, item.name);
      await this.ensureAdminRolePermission(permission);
    }
    await this.ensureDictResource();
    await this.ensureSourceTypeDict();
  }

  private async ensureNotificationSetup() {
    const permissions = [
      { name: '通知模板列表', code: 'system:notification:template:list' },
      { name: '新增通知模板', code: 'system:notification:template:create' },
      { name: '编辑通知模板', code: 'system:notification:template:update' },
      { name: '删除通知模板', code: 'system:notification:template:delete' },
      { name: '通知发布列表', code: 'system:notification:publish:list' },
      { name: '通知发布发送', code: 'system:notification:publish:create' },
      { name: '通知发布重试', code: 'system:notification:publish:retry' },
      { name: '站内信收件箱', code: 'system:notification:inbox:list' },
      { name: '站内信已读', code: 'system:notification:inbox:read' }
    ];
    for (const item of permissions) {
      const permission = await this.ensurePermissionByCode(item.code, item.name);
      await this.ensureAdminRolePermission(permission);
    }
    await this.ensureNotificationResources();
  }

  private async ensurePermission() {
    const exists = await this.permissionRepo.findOne({ where: { code: 'system:divination:use' } });
    if (exists) {
      return exists;
    }
    return this.permissionRepo.save(
      this.permissionRepo.create({ name: '占卜入口', code: 'system:divination:use' })
    );
  }

  private async ensurePermissionByCode(code: string, name: string) {
    const exists = await this.permissionRepo.findOne({ where: { code } });
    if (exists) {
      return exists;
    }
    return this.permissionRepo.save(this.permissionRepo.create({ name, code }));
  }

  private async ensureDivinationResource(permissionCode?: string) {
    const exists = await this.resourceRepo.findOne({ where: { path: '/divination' } });
    const tools = await this.ensureToolsMenu();
    if (exists) {
      if (exists.parentId !== tools.id) {
        await this.resourceRepo.update({ id: exists.id }, { parentId: tools.id });
      }
      return;
    }
    await this.resourceRepo.save(
      this.resourceRepo.create({
        name: '六爻占卜',
        type: 'page',
        path: '/divination',
        parentId: tools.id,
        permissionCode
      })
    );
  }

  private async ensureResourceByPath(path: string, name: string, permissionCode?: string) {
    const exists = await this.resourceRepo.findOne({ where: { path } });
    if (exists) {
      return;
    }
    let system = await this.resourceRepo.findOne({ where: { name: '系统管理', type: 'menu' } });
    if (!system) {
      system = await this.resourceRepo.save(
        this.resourceRepo.create({ name: '系统管理', type: 'menu', sortOrder: 1 })
      );
    }
    await this.resourceRepo.save(
      this.resourceRepo.create({
        name,
        type: 'page',
        path,
        parentId: system.id,
        permissionCode
      })
    );
  }

  private async ensureDashboardResource() {
    const systemMenu = await this.ensureSystemMenu();
    const exists = await this.resourceRepo.findOne({ where: { path: '/' } });
    if (exists) {
      if (
        exists.parentId !== systemMenu.id ||
        exists.permissionCode !== 'system:dashboard:view' ||
        exists.name !== '系统首页'
      ) {
        await this.resourceRepo.update(
          { id: exists.id },
          {
            name: '系统首页',
            parentId: systemMenu.id,
            permissionCode: 'system:dashboard:view'
          }
        );
      }
      return;
    }
    await this.resourceRepo.save(
      this.resourceRepo.create({
        name: '系统首页',
        type: 'page',
        path: '/',
        parentId: systemMenu.id,
        permissionCode: 'system:dashboard:view'
      })
    );
  }

  private async ensureLogPages() {
    const logMenu = await this.ensureLogMenu();
    const pages = [
      { name: '审计日志', path: '/logs/audit', permissionCode: 'system:audit:list' },
      { name: '打点日志', path: '/logs/track', permissionCode: 'system:audit:center' },
      { name: '前端日志', path: '/logs/frontend', permissionCode: 'system:audit:center' },
      { name: '错误日志', path: '/logs/error', permissionCode: 'system:audit:center' }
    ];

    for (const page of pages) {
      let resource = await this.resourceRepo.findOne({ where: { path: page.path } });
      if (!resource && page.path === '/logs/audit') {
        resource = await this.resourceRepo.findOne({ where: { path: '/audit-center' } });
        if (resource) {
          await this.resourceRepo.update(
            { id: resource.id },
            {
              name: page.name,
              path: page.path,
              parentId: logMenu.id,
              permissionCode: page.permissionCode
            }
          );
          continue;
        }
      }
      if (resource) {
        if (
          resource.parentId !== logMenu.id ||
          resource.permissionCode !== page.permissionCode ||
          resource.name !== page.name
        ) {
          await this.resourceRepo.update(
            { id: resource.id },
            {
              name: page.name,
              parentId: logMenu.id,
              permissionCode: page.permissionCode
            }
          );
        }
        continue;
      }
      await this.resourceRepo.save(
        this.resourceRepo.create({
          name: page.name,
          type: 'page',
          path: page.path,
          parentId: logMenu.id,
          permissionCode: page.permissionCode
        })
      );
    }
  }

  private async ensureLogMenu() {
    let logMenu = await this.resourceRepo.findOne({ where: { name: '日志管理', type: 'menu' } });
    if (!logMenu) {
      logMenu = await this.resourceRepo.save(
        this.resourceRepo.create({
          name: '日志管理',
          type: 'menu',
          sortOrder: 3
        })
      );
    }
    return logMenu;
  }

  private async ensureSystemMenu() {
    let systemMenu = await this.resourceRepo.findOne({ where: { name: '系统管理', type: 'menu' } });
    if (!systemMenu) {
      systemMenu = await this.resourceRepo.save(
        this.resourceRepo.create({
          name: '系统管理',
          type: 'menu',
          sortOrder: 1
        })
      );
    }
    return systemMenu;
  }

  private async ensureSystemConfigMenu() {
    let configMenu = await this.resourceRepo.findOne({ where: { name: '系统配置', type: 'menu' } });
    if (!configMenu) {
      configMenu = await this.resourceRepo.save(
        this.resourceRepo.create({
          name: '系统配置',
          type: 'menu',
          sortOrder: 2
        })
      );
    }
    return configMenu;
  }

  private async ensureToolsMenu() {
    let tools = await this.resourceRepo.findOne({ where: { name: '工具', type: 'menu' } });
    if (!tools) {
      tools = await this.resourceRepo.save(
        this.resourceRepo.create({
          name: '工具',
          type: 'menu',
          sortOrder: 4
        })
      );
    }
    return tools;
  }

  private async ensureDictResource() {
    const configMenu = await this.ensureSystemConfigMenu();
    const exists = await this.resourceRepo.findOne({ where: { path: '/dicts' } });
    if (exists) {
      if (exists.parentId !== configMenu.id) {
        await this.resourceRepo.update({ id: exists.id }, { parentId: configMenu.id });
      }
      return;
    }
    await this.resourceRepo.save(
      this.resourceRepo.create({
        name: '字典管理',
        type: 'page',
        path: '/dicts',
        parentId: configMenu.id,
        permissionCode: 'system:dict:list'
      })
    );
  }

  private async ensureSourceTypeDict() {
    let dict = await this.dictRepo.findOne({ where: { code: 'source_type' } });
    if (!dict) {
      dict = await this.dictRepo.save(
        this.dictRepo.create({
          code: 'source_type',
          name: '端来源',
          description: '日志来源端类型',
          status: 1
        })
      );
    }

    const items = [
      { value: 'web', label: 'Web', sortOrder: 1 },
      { value: 'pc', label: 'PC', sortOrder: 2 },
      { value: 'app', label: 'App', sortOrder: 3 }
    ];

    for (const item of items) {
      const exists = await this.dictItemRepo.findOne({
        where: { dictId: dict.id, value: item.value }
      });
      if (!exists) {
        await this.dictItemRepo.save(
          this.dictItemRepo.create({
            dictId: dict.id,
            value: item.value,
            label: item.label,
            sortOrder: item.sortOrder,
            status: 1
          })
        );
      }
    }
  }

  private async ensureNotificationResources() {
    const configMenu = await this.ensureSystemConfigMenu();
    const pages = [
      {
        name: '通知模板',
        path: '/notifications/templates',
        permissionCode: 'system:notification:template:list'
      },
      {
        name: '通知发布',
        path: '/notifications/publish',
        permissionCode: 'system:notification:publish:list'
      },
      {
        name: '站内信',
        path: '/notifications/inbox',
        permissionCode: 'system:notification:inbox:list'
      }
    ];

    for (const page of pages) {
      const exists = await this.resourceRepo.findOne({ where: { path: page.path } });
      if (exists) {
        if (
          exists.parentId !== configMenu.id ||
          exists.permissionCode !== page.permissionCode ||
          exists.name !== page.name
        ) {
          await this.resourceRepo.update(
            { id: exists.id },
            { name: page.name, parentId: configMenu.id, permissionCode: page.permissionCode }
          );
        }
        continue;
      }
      await this.resourceRepo.save(
        this.resourceRepo.create({
          name: page.name,
          type: 'page',
          path: page.path,
          parentId: configMenu.id,
          permissionCode: page.permissionCode
        })
      );
    }
  }

  private async ensureAdminRolePermission(permission: Permission) {
    const role = await this.roleRepo.findOne({ where: { code: 'admin' }, relations: ['permissions'] });
    if (!role) {
      return;
    }
    const hasPermission = role.permissions?.some((item) => item.code === permission.code);
    if (!hasPermission) {
      role.permissions = [...(role.permissions ?? []), permission];
      await this.roleRepo.save(role);
    }
  }

  private async seedAdminUser(role: Role) {
    const passwordHash = await bcrypt.hash('password', 10);
    const user = this.userRepo.create({
      username: 'admin',
      passwordHash,
      nickname: '管理员',
      status: 1,
      roles: [role]
    });
    await this.userRepo.save(user);
  }
}
