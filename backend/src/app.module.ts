// 根模块负责加载数据库连接与业务模块。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { AuditModule } from './modules/audit/audit.module';
import { SeedModule } from './modules/seed/seed.module';
import { AiModule } from './modules/ai/ai.module';
import { DivinationModule } from './modules/divination/divination.module';
import { AuditCenterModule } from './modules/audit-center/audit-center.module';
import { ProfileModule } from './modules/profile/profile.module';
import { LogCenterModule } from './modules/log-center/log-center.module';
import { DictModule } from './modules/dict/dict.module';
import { NotificationModule } from './modules/notification/notification.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { User } from './common/entities/user.entity';
import { Role } from './common/entities/role.entity';
import { Permission } from './common/entities/permission.entity';
import { Resource } from './common/entities/resource.entity';
import { AuditLog } from './common/entities/audit-log.entity';
import { Divination } from './common/entities/divination.entity';
import { DivinationLine } from './common/entities/divination-line.entity';
import { TrackLog } from './common/entities/track-log.entity';
import { FrontendLog } from './common/entities/frontend-log.entity';
import { ErrorLog } from './common/entities/error-log.entity';
import { Dict } from './common/entities/dict.entity';
import { DictItem } from './common/entities/dict-item.entity';
import { NotificationTemplate } from './common/entities/notification-template.entity';
import { NotificationPublish } from './common/entities/notification-publish.entity';
import { NotificationMessage } from './common/entities/notification-message.entity';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: Number(process.env.RATE_LIMIT_TTL ?? 60),
          limit: Number(process.env.RATE_LIMIT_LIMIT ?? 60)
        }
      ]
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(
      isTest
        ? {
            type: 'sqlite',
            database: ':memory:',
            entities: [
              User,
              Role,
              Permission,
              Resource,
              AuditLog,
              Divination,
              DivinationLine,
              TrackLog,
              FrontendLog,
              ErrorLog,
              Dict,
              DictItem,
              NotificationTemplate,
              NotificationPublish,
              NotificationMessage
            ],
            synchronize: true
          }
        : {
            type: 'mysql',
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT ?? 3306),
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            entities: [
              User,
              Role,
              Permission,
              Resource,
              AuditLog,
              Divination,
              DivinationLine,
              TrackLog,
              FrontendLog,
              ErrorLog,
              Dict,
              DictItem,
              NotificationTemplate,
              NotificationPublish,
              NotificationMessage
            ],
            synchronize: process.env.DB_SYNC === 'true'
          }
    ),
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    ResourcesModule,
    AuditModule,
    SeedModule,
    AiModule,
    DivinationModule,
    AuditCenterModule,
    ProfileModule,
    LogCenterModule,
    DictModule,
    NotificationModule,
    DashboardModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
