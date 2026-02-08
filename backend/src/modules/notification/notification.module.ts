// 通知模块注册模板、发布与通道适配器。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationTemplate } from '../../common/entities/notification-template.entity';
import { NotificationPublish } from '../../common/entities/notification-publish.entity';
import { NotificationMessage } from '../../common/entities/notification-message.entity';
import { User } from '../../common/entities/user.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationTriggerService } from './notification-trigger.service';
import { InboxNotificationProvider } from './providers/inbox-notification.provider';
import { FeishuNotificationProvider } from './providers/feishu-notification.provider';
import { NotificationProviderRegistry } from './providers/notification-provider.registry';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationTemplate, NotificationPublish, NotificationMessage, User])],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationTriggerService,
    InboxNotificationProvider,
    FeishuNotificationProvider,
    NotificationProviderRegistry
  ],
  exports: [NotificationService, NotificationTriggerService]
})
export class NotificationModule {}
