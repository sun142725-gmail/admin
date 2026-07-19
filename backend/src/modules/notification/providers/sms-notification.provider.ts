import { Injectable, Logger } from '@nestjs/common';
import { NotificationProvider } from './notification-provider.interface';
import { NotificationChannelType, NotificationSendRequest, NotificationSendResult } from '../notification.types';

@Injectable()
export class SmsNotificationProvider implements NotificationProvider {
  readonly channelType: NotificationChannelType = 'sms';
  private readonly logger = new Logger(SmsNotificationProvider.name);

  async send(request: NotificationSendRequest): Promise<NotificationSendResult> {
    if (!request.messages.length) {
      return {
        status: 'failed',
        failReason: '收件人为空'
      };
    }
    const mode = process.env.SMS_PROVIDER_MODE || 'console';
    try {
      for (const message of request.messages) {
        const phone = message.recipientId?.trim();
        if (!phone) {
          throw new Error('手机号为空');
        }
        if (mode === 'console') {
          this.logger.log(`SMS -> ${phone}: ${this.stripHtml(message.content)}`);
          continue;
        }
        throw new Error(`未配置可用短信通道: ${mode}`);
      }
    } catch (error) {
      return {
        status: 'failed',
        failReason: error instanceof Error ? error.message : '短信发送失败'
      };
    }
    return {
      status: 'success',
      meta: {
        messageCount: request.messages.length,
        mode
      }
    };
  }

  private stripHtml(value: string) {
    return value
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
