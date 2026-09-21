// 对话编排：两段式流（POST 预启动 + GET SSE 订阅），同一消息的并发订阅共享同一次生成。
// 复用占卜模块验证过的模式：Map 共享 Subject + 完成后重放 + 部分内容收尾。
import { Injectable, MessageEvent, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgent } from '../../../common/entities/ai-agent.entity';
import { ModelRouterService, RoutedCandidate } from '../core/model-router.service';
import { UsageLogService } from '../core/usage-log.service';
import { ChatMessagePayload, ChatRequestOptions } from '../core/llm-adapter.interface';
import { ChatRequestDto } from './dto/chat.dto';
import { ConversationsService } from './conversations.service';

interface ChatStreamState {
  subject: Subject<MessageEvent>;
  buffer: string;
  done: boolean;
  errorMessage?: string;
}

const ESTIMATE_CHARS_PER_TOKEN = 2; // P0 粗估：中文约 2 字符/token
const CONTEXT_MAX_TURNS = 20;
const STREAM_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AiChatService implements OnModuleDestroy {
  private readonly streams = new Map<number, ChatStreamState>();
  private readonly ttlTimers = new Map<number, NodeJS.Timeout>();

  constructor(
    @InjectRepository(AiAgent) private readonly agentRepo: Repository<AiAgent>,
    private readonly router: ModelRouterService,
    private readonly usageLog: UsageLogService,
    private readonly conversations: ConversationsService
  ) {}

  // 应用关闭：清理 TTL 定时器，避免拖住事件循环（jest 等测试环境必需）。
  onModuleDestroy() {
    this.ttlTimers.forEach((timer) => clearTimeout(timer));
    this.ttlTimers.clear();
    this.streams.forEach((state) => {
      if (!state.done) {
        state.done = true;
        state.subject.complete();
      }
    });
    this.streams.clear();
  }

  // 第一步：POST 提交内容，落库用户消息并后台启动生成，立即返回消息 ID。
  async submit(userId: number, dto: ChatRequestDto) {
    let conversationId = dto.conversationId;
    let agent: AiAgent | undefined;
    let modelId = dto.modelId;
    if (conversationId) {
      const conversation = await this.conversations.ownedConversation(userId, conversationId);
      // 会话内保持原智能体/模型设定。
      agent = conversation.agentId
        ? ((await this.agentRepo.findOne({ where: { id: conversation.agentId } })) ?? undefined)
        : undefined;
      modelId = agent?.kind === 'native' ? agent.modelId : conversation.modelId ?? dto.modelId;
    } else {
      if (dto.agentId) {
        agent = (await this.agentRepo.findOne({ where: { id: dto.agentId } })) ?? undefined;
        if (!agent || agent.status !== 1) {
          throw new NotFoundException('智能体不存在或已停用');
        }
        modelId = agent.kind === 'native' ? agent.modelId : undefined;
      }
      const created = await this.conversations.create(userId, {
        agentId: agent?.id,
        modelId,
        title: dto.content.slice(0, 20)
      });
      conversationId = created.id;
    }

    await this.conversations.saveMessage({ conversationId, role: 'user', content: dto.content });
    // 占位助手消息：SSE 订阅句柄即该消息 ID，生成结束后覆写。
    const placeholder = await this.conversations.saveMessage({
      conversationId,
      role: 'assistant',
      content: '',
      status: 'generating'
    });
    void this.runGeneration(userId, conversationId, placeholder.id, agent, modelId, dto.content);
    return { conversationId, messageId: placeholder.id };
  }

  // 第二步：GET SSE 订阅生成流（生成中共享；已结束重放结果）。
  // 必须同步返回 Observable（@Sse 对 Promise<Observable> 支持不完整，会丢失 event 行）。
  stream(userId: number, messageId: number): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      void this.resolveStream(userId, messageId)
        .then((observable) => observable.subscribe(subscriber))
        .catch((error: unknown) => {
          subscriber.next({
            type: 'error',
            data: { message: error instanceof Error ? error.message : '订阅失败' }
          });
          subscriber.complete();
        });
      return () => {
        // 订阅断开由内层 subject.complete() 自然收尾。
      };
    });
  }

  private async resolveStream(userId: number, messageId: number): Promise<Observable<MessageEvent>> {
    await this.conversations.ownershipByMessage(userId, messageId);
    const state = this.streams.get(messageId);
    if (!state) {
      // 无进行中任务：消息可能已完成且缓存过期，回放落库内容。
      return this.replayFromDb(messageId);
    }
    if (state.done) {
      return this.replayState(messageId, state);
    }
    return state.subject.asObservable();
  }

  private async replayFromDb(messageId: number): Promise<Observable<MessageEvent>> {
    const subject = new Subject<MessageEvent>();
    const message = await this.conversations.getMessage(messageId);
    setTimeout(() => {
      if (!message || message.status === 'generating') {
        subject.next({ type: 'error', data: { message: '生成任务不存在或已过期' } });
      } else if (message.status === 'failed') {
        subject.next({
          type: 'error',
          data: { message: message.errorMessage ?? '生成失败' }
        });
      } else {
        if (message.content) {
          subject.next({ type: 'chunk', data: { text: message.content } });
        }
        subject.next({ type: 'done', data: { status: 'completed' } });
      }
      subject.complete();
    }, 0);
    return subject.asObservable();
  }

  private replayState(messageId: number, state: ChatStreamState): Observable<MessageEvent> {
    void messageId;
    const subject = new Subject<MessageEvent>();
    setTimeout(() => {
      if (state.buffer) {
        subject.next({ type: 'chunk', data: { text: state.buffer } });
      }
      if (state.errorMessage) {
        subject.next({ type: 'error', data: { message: state.errorMessage } });
      } else {
        subject.next({ type: 'done', data: { status: 'completed' } });
      }
      subject.complete();
    }, 0);
    return subject.asObservable();
  }

  // 后台生成：候选渠道逐个尝试，部分输出即收尾（与占卜一致）。
  private async runGeneration(
    userId: number,
    conversationId: number,
    messageId: number,
    agent: AiAgent | undefined,
    modelId: number | undefined,
    content: string
  ) {
    const state: ChatStreamState = { subject: new Subject<MessageEvent>(), buffer: '', done: false };
    this.streams.set(messageId, state);
    const startedAt = Date.now();
    const promptTokens = Math.ceil(content.length / ESTIMATE_CHARS_PER_TOKEN);

    const finish = async (
      status: 'ok' | 'failed' | 'stopped',
      errorMessage?: string
    ) => {
      state.done = true;
      state.errorMessage = errorMessage;
      if (errorMessage) {
        state.subject.next({ type: 'error', data: { message: errorMessage } });
      } else {
        state.subject.next({ type: 'done', data: { status: 'completed' } });
      }
      state.subject.complete();
      this.usageLog.record({
        userId,
        modelId,
        kind: 'chat',
        promptTokens,
        completionTokens: Math.ceil(state.buffer.length / ESTIMATE_CHARS_PER_TOKEN),
        latencyMs: Date.now() - startedAt,
        status,
        errorMessage: errorMessage?.slice(0, 255)
      });
      const timer = setTimeout(() => {
        this.streams.delete(messageId);
        this.ttlTimers.delete(messageId);
      }, STREAM_TTL_MS);
      this.ttlTimers.set(messageId, timer);
    };

    let usedModelId = modelId;

    try {
      // 组装候选：dify 智能体用自身端点直连；其余走模型路由（同 model_key 多行互备）。
      let candidates: RoutedCandidate[] = [];
      if (agent?.kind === 'dify') {
        candidates = await this.router.candidatesForDify(agent);
      } else if (modelId) {
        candidates = await this.router.candidatesByModel(modelId);
      } else {
        candidates = await this.router.candidatesByCapability('chat');
      }
      if (candidates.length === 0) {
        await this.conversations.updateMessage(messageId, {
          status: 'failed',
          errorMessage: '没有可用的模型渠道，请联系管理员在 AI 管理里配置'
        });
        await finish('failed', '没有可用的模型渠道，请联系管理员在 AI 管理里配置');
        return;
      }

      // 组装上下文：system 提示词 + 近期历史 + 本条消息。
      const messages: ChatMessagePayload[] = [];
      const systemPrompt = agent?.systemPrompt?.trim();
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      if (agent?.kind !== 'dify') {
        const history = await this.conversations.historyMessages(conversationId, CONTEXT_MAX_TURNS);
        messages.push(...history);
      }
      messages.push({ role: 'user', content });

      const options: ChatRequestOptions = {
        temperature: agent?.temperature != null ? Number(agent.temperature) : undefined,
        topP: agent?.topP != null ? Number(agent.topP) : undefined,
        maxTokens: agent?.maxTokens ?? undefined
      };

      let lastError: Error | null = null;
      for (const candidate of candidates) {
        let yielded = false;
        try {
          for await (const delta of candidate.adapter.chatStream(messages, options, candidate.channel)) {
            yielded = true;
            state.buffer += delta;
            state.subject.next({ type: 'chunk', data: { text: delta } });
          }
          // 成功：覆写占位消息并收尾。
          usedModelId = candidate.model.id || undefined;
          await this.conversations.updateMessage(messageId, {
            content: state.buffer,
            modelId: usedModelId,
            promptTokens,
            completionTokens: Math.ceil(state.buffer.length / ESTIMATE_CHARS_PER_TOKEN),
            latencyMs: Date.now() - startedAt,
            status: 'ok',
            errorMessage: undefined
          });
          await finish('ok');
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('生成失败');
          if (yielded) {
            // 已有部分输出：按现有内容收尾，不切换渠道。
            usedModelId = candidate.model.id || undefined;
            await this.conversations.updateMessage(messageId, {
              content: state.buffer,
              modelId: usedModelId,
              latencyMs: Date.now() - startedAt,
              status: 'stopped',
              errorMessage: lastError.message.slice(0, 255)
            });
            await finish('stopped');
            return;
          }
        }
      }
      const message = lastError?.message ?? '所有渠道均调用失败';
      await this.conversations.updateMessage(messageId, {
        status: 'failed',
        errorMessage: message.slice(0, 255)
      });
      await finish('failed', message);
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      await this.conversations.updateMessage(messageId, { status: 'failed', errorMessage: message.slice(0, 255) });
      await finish('failed', message);
    }
  }
}
