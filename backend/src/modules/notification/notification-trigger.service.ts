import { Injectable, Logger } from '@nestjs/common';
import { PublishNotificationDto } from './dto/publish-notification.dto';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationTriggerService {
  private readonly logger = new Logger(NotificationTriggerService.name);

  constructor(private readonly notificationService: NotificationService) {}

  async sendInbox(params: {
    templateId: number;
    userIds: number[];
    title?: string;
    variables?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const payload: PublishNotificationDto = {
      templateId: params.templateId,
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
    templateId: number;
    webhooks?: string[];
    title?: string;
    variables?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const payload: PublishNotificationDto = {
      templateId: params.templateId,
      channelType: 'feishu',
      recipients: params.webhooks ?? [],
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
        `业务通知发送失败，templateId=${payload.templateId}, channel=${payload.channelType}`,
        error instanceof Error ? error.stack : undefined
      );
      return null;
    }
  }
}
