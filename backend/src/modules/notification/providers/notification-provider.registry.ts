// 通道注册表用于按类型获取发送适配器。
import { Injectable } from '@nestjs/common';
import { NotificationChannelType } from '../notification.types';
import { FeishuNotificationProvider } from './feishu-notification.provider';
import { InboxNotificationProvider } from './inbox-notification.provider';
import { SmsNotificationProvider } from './sms-notification.provider';
import { EmailNotificationProvider } from './email-notification.provider';
import { NotificationProvider } from './notification-provider.interface';

@Injectable()
export class NotificationProviderRegistry {
  private readonly providerMap: Map<NotificationChannelType, NotificationProvider>;

  constructor(
    inboxProvider: InboxNotificationProvider,
    feishuProvider: FeishuNotificationProvider,
    smsProvider: SmsNotificationProvider,
    emailProvider: EmailNotificationProvider
  ) {
    this.providerMap = new Map<NotificationChannelType, NotificationProvider>([
      [inboxProvider.channelType, inboxProvider],
      [feishuProvider.channelType, feishuProvider],
      [smsProvider.channelType, smsProvider],
      [emailProvider.channelType, emailProvider]
    ]);
  }

  getProvider(channelType: NotificationChannelType): NotificationProvider | undefined {
    return this.providerMap.get(channelType);
  }
}
