// 会话服务：本人的多会话管理与消息查询。
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiConversation } from '../../../common/entities/ai-conversation.entity';
import { AiMessage } from '../../../common/entities/ai-message.entity';
import { CreateConversationDto } from './dto/chat.dto';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(AiConversation) private readonly conversationRepo: Repository<AiConversation>,
    @InjectRepository(AiMessage) private readonly messageRepo: Repository<AiMessage>
  ) {}

  async list(userId: number) {
    const items = await this.conversationRepo.find({
      where: { userId, status: 1 },
      order: { updatedAt: 'DESC' }
    });
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      agentId: item.agentId,
      modelId: item.modelId,
      updatedAt: item.updatedAt
    }));
  }

  async create(userId: number, dto: CreateConversationDto) {
    const saved = await this.conversationRepo.save(
      this.conversationRepo.create({
        userId,
        agentId: dto.agentId,
        modelId: dto.modelId,
        title: dto.title?.trim() || '新对话'
      })
    );
    return { id: saved.id, title: saved.title, agentId: saved.agentId, modelId: saved.modelId };
  }

  async messages(userId: number, conversationId: number) {
    const conversation = await this.ownedConversation(userId, conversationId);
    const items = await this.messageRepo.find({
      where: { conversationId: conversation.id },
      order: { id: 'ASC' }
    });
    return items.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      contentType: item.contentType,
      status: item.status,
      createdAt: item.createdAt
    }));
  }

  async rename(userId: number, conversationId: number, title: string) {
    const conversation = await this.ownedConversation(userId, conversationId);
    conversation.title = title.trim().slice(0, 64) || '新对话';
    await this.conversationRepo.save(conversation);
    return { success: true, title: conversation.title };
  }

  async remove(userId: number, conversationId: number) {
    const conversation = await this.ownedConversation(userId, conversationId);
    await this.messageRepo.delete({ conversationId: conversation.id });
    await this.conversationRepo.remove(conversation);
    return { success: true };
  }

  // 读取单条消息（SSE 重放用）。
  async getMessage(messageId: number) {
    return this.messageRepo.findOne({ where: { id: messageId } });
  }

  // 通过消息 ID 校验归属（SSE 订阅鉴权用）。
  async ownershipByMessage(userId: number, messageId: number) {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('消息不存在');
    }
    return this.ownedConversation(userId, message.conversationId);
  }

  // 覆写占位助手消息（生成结束/失败/中止时）。
  async updateMessage(messageId: number, payload: {
    content?: string;
    modelId?: number;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    status?: string;
    errorMessage?: string;
  }) {
    await this.messageRepo.update({ id: messageId }, payload);
  }

  // 供 chat.service 使用：校验归属并返回会话。
  async ownedConversation(userId: number, conversationId: number) {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation || conversation.status !== 1) {
      throw new NotFoundException('会话不存在');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('只能访问自己的会话');
    }
    return conversation;
  }

  async historyMessages(conversationId: number, limit = 20) {
    const items = await this.messageRepo.find({
      where: { conversationId, status: 'ok', contentType: 'text' },
      order: { id: 'DESC' },
      take: limit
    });
    return items.reverse().map((item) => ({
      role: item.role as 'user' | 'assistant' | 'system',
      content: item.content.slice(0, 4000)
    }));
  }

  async saveMessage(payload: {
    conversationId: number;
    role: 'user' | 'assistant';
    content: string;
    modelId?: number;
    channelId?: number;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    status?: string;
    errorMessage?: string;
  }) {
    return this.messageRepo.save(this.messageRepo.create(payload));
  }

  async touch(conversationId: number, title?: string) {
    if (title) {
      await this.conversationRepo.update({ id: conversationId }, { title: title.slice(0, 64) });
      return;
    }
    await this.conversationRepo.update({ id: conversationId }, {});
  }
}
