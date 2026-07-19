import { Injectable } from '@nestjs/common';
import { NotificationProvider } from './notification-provider.interface';
import { NotificationChannelType, NotificationSendRequest, NotificationSendResult } from '../notification.types';
import { sendEmail } from '../../../utils/email';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  readonly channelType: NotificationChannelType = 'email';

  async send(request: NotificationSendRequest): Promise<NotificationSendResult> {
    if (!request.messages.length) {
      return {
        status: 'failed',
        failReason: '收件人为空'
      };
    }
    try {
      for (const message of request.messages) {
        const email = message.recipientId?.trim();
        if (!email) {
          throw new Error('邮箱地址为空');
        }
        await sendEmail({
          to: email,
          subject: message.title,
          html: message.content,
          text: this.stripHtml(message.content)
        });
      }
    } catch (error) {
      return {
        status: 'failed',
        failReason: error instanceof Error ? error.message : '邮箱发送失败'
      };
    }
    return {
      status: 'success',
      meta: {
        messageCount: request.messages.length
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
