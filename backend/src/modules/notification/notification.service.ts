// 通知服务负责模板管理、发送调度与发布记录。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NotificationTemplate } from '../../common/entities/notification-template.entity';
import { NotificationPublish } from '../../common/entities/notification-publish.entity';
import { NotificationMessage } from '../../common/entities/notification-message.entity';
import { User } from '../../common/entities/user.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { PublishNotificationDto } from './dto/publish-notification.dto';
import { QueryInboxDto } from './dto/query-inbox.dto';
import { QueryPublishDto } from './dto/query-publish.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import {
  NotificationChannelType,
  NotificationSendMessage,
  NotificationSendRequest,
  NotificationSendResult,
  NotificationVariableDefinition
} from './notification.types';
import { NotificationProviderRegistry } from './providers/notification-provider.registry';

const BUILTIN_VARIABLES: NotificationVariableDefinition[] = [
  { key: 'userNickname', label: '用户昵称', source: 'user', required: true },
  { key: 'eventInfo', label: '事件信息', source: 'event' },
  { key: 'systemParam', label: '系统参数', source: 'system' }
];

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(NotificationPublish)
    private readonly publishRepo: Repository<NotificationPublish>,
    @InjectRepository(NotificationMessage)
    private readonly messageRepo: Repository<NotificationMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly providerRegistry: NotificationProviderRegistry
  ) {}

  async listTemplates(query: QueryTemplateDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const qb = this.templateRepo.createQueryBuilder('template');
    if (query.keyword) {
      qb.where('template.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    if (query.status !== undefined) {
      if (query.keyword) {
        qb.andWhere('template.status = :status', { status: query.status });
      } else {
        qb.where('template.status = :status', { status: query.status });
      }
    }
    qb.orderBy('template.updatedAt', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async createTemplate(payload: CreateTemplateDto) {
    const variables = this.normalizeTemplateVariables(payload.variables);
    const template = this.templateRepo.create({
      name: payload.name,
      channelTypes: payload.channelTypes,
      content: payload.content,
      variables,
      status: payload.status ?? 1
    });
    return this.templateRepo.save(template);
  }

  async updateTemplate(id: number, payload: UpdateTemplateDto) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    const variables = payload.variables
      ? this.normalizeTemplateVariables(payload.variables)
      : template.variables;
    Object.assign(template, payload, { variables });
    return this.templateRepo.save(template);
  }

  async removeTemplate(id: number) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    const usedCount = await this.publishRepo.count({ where: { templateId: id } });
    if (usedCount > 0) {
      throw new BadRequestException('模板已被发布记录引用，不能删除');
    }
    await this.templateRepo.delete({ id });
    return true;
  }

  async publish(payload: PublishNotificationDto) {
    if (payload.idempotencyKey) {
      const existing = await this.publishRepo.findOne({
        where: { idempotencyKey: payload.idempotencyKey }
      });
      if (existing) {
        return existing;
      }
    }
    const template = await this.templateRepo.findOne({ where: { id: payload.templateId } });
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    if (template.status !== 1) {
      throw new BadRequestException('模板未启用');
    }
    const channelType = payload.channelType as NotificationChannelType;
    if (!template.channelTypes?.includes(channelType)) {
      throw new BadRequestException('模板未配置该通道');
    }
    const recipients = payload.recipients?.map((item) => String(item).trim()).filter(Boolean) ?? [];
    const normalizedRecipients = this.normalizeRecipients(channelType, recipients);
    if (!normalizedRecipients.length) {
      throw new BadRequestException('收件人不能为空');
    }
    const variableValues = this.normalizeVariables(payload.variables);
    this.validateTemplateContent(template, variableValues, channelType);

    const insertResult = await this.publishRepo.insert({
      templateId: template.id,
      channelType,
      payload: {
        recipients: normalizedRecipients,
        variables: variableValues,
        title: payload.title ?? template.name,
        extra: payload.extra
      },
      status: 'sending',
      retryCount: 0,
      idempotencyKey: payload.idempotencyKey
    });
    const publishId = Number(insertResult.identifiers?.[0]?.id);
    const publish = await this.publishRepo.findOne({ where: { id: publishId } });
    if (!publish) {
      throw new BadRequestException('创建发布记录失败');
    }

    return this.executePublish(
      publish,
      template,
      normalizedRecipients,
      variableValues,
      payload.title ?? template.name
    );
  }

  async listPublishes(query: QueryPublishDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const qb = this.publishRepo
      .createQueryBuilder('publish')
      .leftJoinAndSelect('publish.template', 'template');
    if (query.channelType) {
      qb.andWhere('publish.channel_type = :channelType', { channelType: query.channelType });
    }
    if (query.status) {
      qb.andWhere('publish.status = :status', { status: query.status });
    }
    if (query.templateId) {
      qb.andWhere('publish.template_id = :templateId', { templateId: query.templateId });
    }
    if (query.keyword) {
      qb.andWhere('template.name LIKE :keyword', { keyword: `%${query.keyword}%` });
    }
    qb.orderBy('publish.createdAt', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async getPublishDetail(id: number) {
    const publish = await this.publishRepo.findOne({
      where: { id },
      relations: ['template']
    });
    if (!publish) {
      throw new NotFoundException('发布记录不存在');
    }
    const messages = await this.messageRepo.find({
      where: { publishId: id },
      relations: ['user'],
      order: { createdAt: 'DESC' }
    });
    return {
      ...publish,
      messages
    };
  }

  async retryPublish(id: number, reason?: string) {
    const publish = await this.publishRepo.findOne({ where: { id }, relations: ['template'] });
    if (!publish) {
      throw new NotFoundException('发布记录不存在');
    }
    if (!publish.template) {
      throw new BadRequestException('关联模板不存在');
    }
    if (publish.status === 'sending') {
      return publish;
    }
    if (publish.status === 'success') {
      return publish;
    }
    const payload = (publish.payload ?? {}) as Record<string, unknown>;
    const recipients = Array.isArray(payload.recipients) ? (payload.recipients as string[]) : [];
    const variables = (payload.variables ?? {}) as Record<string, string>;
    const title = (payload.title as string) ?? publish.template.name;

    const nextRetryCount = (publish.retryCount ?? 0) + 1;
    await this.publishRepo.update(
      { id: publish.id },
      {
        status: 'sending',
        retryCount: nextRetryCount,
        failReason: reason ?? publish.failReason
      }
    );
    publish.status = 'sending';
    publish.retryCount = nextRetryCount;
    publish.failReason = reason ?? publish.failReason;

    return this.executePublish(publish, publish.template, recipients, variables, title);
  }

  async listInbox(userId: number, query: QueryInboxDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const qb = this.messageRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.publish', 'publish')
      .leftJoinAndSelect('publish.template', 'template')
      .where('message.user_id = :userId', { userId });
    if (query.status) {
      qb.andWhere('message.status = :status', { status: query.status });
    }
    if (query.keyword) {
      qb.andWhere('(message.title LIKE :keyword OR message.content LIKE :keyword)', {
        keyword: `%${query.keyword}%`
      });
    }
    qb.orderBy('message.createdAt', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    const unreadCount = await this.messageRepo.count({ where: { userId, status: 'unread' } });
    return { items, total, page, pageSize, unreadCount };
  }

  async markInboxRead(userId: number, id: number) {
    const message = await this.messageRepo.findOne({ where: { id, userId } });
    if (!message) {
      throw new NotFoundException('站内信不存在');
    }
    if (message.status !== 'read') {
      message.status = 'read';
      message.readAt = new Date();
      await this.messageRepo.save(message);
    }
    return message;
  }

  async markAllInboxRead(userId: number) {
    await this.messageRepo
      .createQueryBuilder()
      .update(NotificationMessage)
      .set({ status: 'read', readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('status = :status', { status: 'unread' })
      .execute();
    return true;
  }

  private async executePublish(
    publish: NotificationPublish,
    template: NotificationTemplate,
    recipients: string[],
    variables: Record<string, string>,
    title: string
  ) {
    const channelType = publish.channelType as NotificationChannelType;
    let result: NotificationSendResult;
    try {
      const messages = await this.buildMessages(channelType, template, recipients, variables, title);
      const provider = this.providerRegistry.getProvider(channelType);
      if (!provider) {
        throw new BadRequestException('未找到通道适配器');
      }
      const request: NotificationSendRequest = {
        publishId: publish.id,
        channelType,
        messages
      };
      result = await provider.send(request);
    } catch (error) {
      result = {
        status: 'failed',
        failReason: error instanceof Error ? error.message : '发送失败'
      };
    }

    publish.status = result.status;
    publish.failReason = result.failReason;
    await this.publishRepo.update(
      { id: publish.id },
      { status: result.status, failReason: result.failReason }
    );

    return publish;
  }

  private async buildMessages(
    channelType: NotificationChannelType,
    template: NotificationTemplate,
    recipients: string[],
    variables: Record<string, string>,
    title: string
  ): Promise<NotificationSendMessage[]> {
    if (channelType === 'inbox') {
      const userIds = recipients.map((id) => Number(id)).filter((id) => Number.isFinite(id));
      if (!userIds.length) {
        throw new BadRequestException('站内信收件人必须为用户 ID');
      }
      const users = await this.userRepo.find({ where: { id: In(userIds) } });
      if (users.length !== userIds.length) {
        throw new BadRequestException('存在无效的用户 ID');
      }
      const userMap = new Map(users.map((user) => [user.id, user]));
      return userIds.map((userId) => {
        const user = userMap.get(userId);
        const merged = {
          ...variables,
          userNickname: variables.userNickname ?? user?.nickname ?? user?.username ?? ''
        };
        const content = this.renderContent(template.content, merged);
        return {
          recipientId: String(userId),
          title,
          content
        };
      });
    }

    const content = this.renderContent(template.content, variables);
    return recipients.map((recipientId) => ({
      recipientId,
      title,
      content
    }));
  }

  private normalizeRecipients(channelType: NotificationChannelType, recipients: string[]) {
    if (channelType === 'feishu' && recipients.length === 0) {
      const defaultWebhook = process.env.FEISHU_BOT_WEBHOOK?.trim();
      return defaultWebhook ? [defaultWebhook] : [];
    }
    return recipients;
  }

  private normalizeTemplateVariables(variables?: NotificationVariableDefinition[]) {
    const mergedMap = new Map<string, NotificationVariableDefinition>();
    BUILTIN_VARIABLES.forEach((item) => mergedMap.set(item.key, item));
    (variables ?? []).forEach((item) => mergedMap.set(item.key, item));
    for (const item of mergedMap.values()) {
      if (!this.isValidVariableKey(item.key)) {
        throw new BadRequestException(`变量 key 格式非法: ${item.key}`);
      }
    }
    return Array.from(mergedMap.values());
  }

  private normalizeVariables(variables?: Record<string, unknown>) {
    const result: Record<string, string> = {};
    if (!variables) {
      return result;
    }
    Object.entries(variables).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    });
    return result;
  }

  private validateTemplateContent(
    template: NotificationTemplate,
    variables: Record<string, string>,
    channelType: NotificationChannelType
  ) {
    const placeholders = this.extractPlaceholders(template.content);
    const allowedKeys = new Set((template.variables ?? []).map((item) => item.key));
    for (const key of placeholders) {
      if (!allowedKeys.has(key)) {
        throw new BadRequestException(`模板包含未声明变量: ${key}`);
      }
    }
    const requiredKeys = (template.variables ?? [])
      .filter((item) => item.required)
      .map((item) => item.key);
    for (const key of requiredKeys) {
      if (!variables[key] && !(channelType === 'inbox' && key === 'userNickname')) {
        throw new BadRequestException(`变量缺失: ${key}`);
      }
    }
  }

  private extractPlaceholders(content: string) {
    const regex = /{{\s*var\.([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;
    const keys = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      keys.add(match[1]);
    }
    return keys;
  }

  private renderContent(content: string, variables: Record<string, string>) {
    return content.replace(/{{\s*var\.([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (_match, key) => {
      return variables[key] ?? '';
    });
  }

  private isValidVariableKey(key: string) {
    return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key);
  }
}
