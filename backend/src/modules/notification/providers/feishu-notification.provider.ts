// 飞书通道适配器通过机器人 webhook 发送文本消息。
import { Injectable } from '@nestjs/common';
import { NotificationProvider } from './notification-provider.interface';
import { NotificationChannelType, NotificationSendRequest, NotificationSendResult } from '../notification.types';

@Injectable()
export class FeishuNotificationProvider implements NotificationProvider {
  readonly channelType: NotificationChannelType = 'feishu';

  async send(request: NotificationSendRequest): Promise<NotificationSendResult> {
    if (!request.messages.length) {
      return {
        status: 'failed',
        failReason: '收件人为空'
      };
    }
    try {
      for (const message of request.messages) {
        const webhook = message.recipientId?.trim();
        if (!webhook) {
          throw new Error('飞书机器人地址为空');
        }
        const text = `${message.title}\n${this.stripHtml(message.content)}`;
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msg_type: 'text',
            content: {
              text
            }
          })
        });
        if (!response.ok) {
          throw new Error(`飞书发送失败: HTTP ${response.status}`);
        }
      }
    } catch (error) {
      return {
        status: 'failed',
        failReason: error instanceof Error ? error.message : '飞书发送失败'
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
