// 站内信通道适配器负责写入站内消息。
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationMessage } from '../../../common/entities/notification-message.entity';
import { NotificationProvider } from './notification-provider.interface';
import { NotificationChannelType, NotificationSendRequest, NotificationSendResult } from '../notification.types';

@Injectable()
export class InboxNotificationProvider implements NotificationProvider {
  readonly channelType: NotificationChannelType = 'inbox';

  constructor(
    @InjectRepository(NotificationMessage)
    private readonly messageRepo: Repository<NotificationMessage>
  ) {}

  async send(request: NotificationSendRequest): Promise<NotificationSendResult> {
    if (!request.messages.length) {
      return {
        status: 'failed',
        failReason: '收件人为空'
      };
    }
    const entities = request.messages.map((message) =>
      this.messageRepo.create({
        publishId: request.publishId,
        userId: Number(message.recipientId),
        title: message.title,
        content: message.content,
        status: 'unread'
      })
    );
    await this.messageRepo.save(entities);
    return { status: 'success' };
  }
}
