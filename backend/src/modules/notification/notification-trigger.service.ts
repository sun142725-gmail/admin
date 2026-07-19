import { Injectable, Logger } from '@nestjs/common';
import { PublishNotificationDto } from './dto/publish-notification.dto';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationTriggerService {
  private readonly logger = new Logger(NotificationTriggerService.name);

  constructor(private readonly notificationService: NotificationService) {}

  async sendInbox(params: {
    templateId?: number;
    templateCode?: string;
    userIds: number[];
    title?: string;
    variables?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const payload: PublishNotificationDto = {
      templateId: params.templateId,
      templateCode: params.templateCode,
      channelType: 'inbox',
      recipients: params.userIds,
      title: params.title,
      variables: params.variables,
      extra: params.extra,
      idempotencyKey: params.idempotencyKey
    };
    return this.notificationService.publish(payload);
  }

  async sendFeishu(params: {
    templateId?: number;
    templateCode?: string;
    webhooks?: string[];
    title?: string;
    variables?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const payload: PublishNotificationDto = {
      templateId: params.templateId,
      templateCode: params.templateCode,
      channelType: 'feishu',
      recipients: params.webhooks ?? [],
      title: params.title,
      variables: params.variables,
      extra: params.extra,
      idempotencyKey: params.idempotencyKey
    };
    return this.notificationService.publish(payload);
  }

  async sendSms(params: {
    templateId?: number;
    templateCode?: string;
    phones: string[];
    title?: string;
    variables?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const payload: PublishNotificationDto = {
      templateId: params.templateId,
      templateCode: params.templateCode,
      channelType: 'sms',
      recipients: params.phones,
      title: params.title,
      variables: params.variables,
      extra: params.extra,
      idempotencyKey: params.idempotencyKey
    };
    return this.notificationService.publish(payload);
  }

  async sendEmail(params: {
    templateId?: number;
    templateCode?: string;
    emails: string[];
    title?: string;
    variables?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const payload: PublishNotificationDto = {
      templateId: params.templateId,
      templateCode: params.templateCode,
      channelType: 'email',
      recipients: params.emails,
      title: params.title,
      variables: params.variables,
      extra: params.extra,
      idempotencyKey: params.idempotencyKey
    };
    return this.notificationService.publish(payload);
  }

  async sendSafe(payload: PublishNotificationDto) {
    try {
      return await this.notificationService.publish(payload);
    } catch (error) {
      this.logger.error(
        `业务通知发送失败，template=${payload.templateCode ?? payload.templateId}, channel=${payload.channelType}`,
        error instanceof Error ? error.stack : undefined
      );
      return null;
    }
  }
}
