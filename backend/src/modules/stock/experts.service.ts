// 专家服务：按业务编码解析圆桌智能体（提示词/采样参数/绑定模型），
// 经模型路由流式调用 LLM；无可用渠道或全部失败时回落本地规则兜底。
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgent } from '../../common/entities/ai-agent.entity';
import { ModelRouterService, RoutedCandidate } from '../ai/core/model-router.service';
import { UsageLogService } from '../ai/core/usage-log.service';
import { ChatMessagePayload, ChatRequestOptions } from '../ai/core/llm-adapter.interface';
import { ExpertDefinition, MODERATOR_DEFINITION } from './experts.definitions';
import { SearchExecutorService } from './market/search-executor.service';

const AGENT_CACHE_TTL_MS = 60 * 1000;
const ESTIMATE_CHARS_PER_TOKEN = 2;

export interface StreamCallParams {
  def: ExpertDefinition;
  userPrompt: string;
  userId: number;
  /** 流式回调：每个增量片段回调一次。 */
  onDelta: (text: string) => void;
  /** 本地兜底内容生成器；不提供时渠道不可用将直接抛错。 */
  fallback?: () => string;
  /** 本次调用的剩余时间预算（毫秒），超时按已有内容收尾。 */
  budgetMs: number;
  /** 会话级指定模型（用户在界面选择），优先于智能体绑定模型。 */
  preferredModelId?: number | null;
}

export interface StreamCallResult {
  content: string;
  source: 'llm' | 'local';
  usedModelId?: number;
  /** 命中渠道的展示名（如 grok-4.6-free），供前端标注生成引擎。 */
  modelLabel?: string;
}

interface AgentCacheEntry {
  at: number;
  agent: AiAgent | null;
}

@Injectable()
export class ExpertsService {
  private readonly logger = new Logger(ExpertsService.name);
  private readonly agentCache = new Map<string, AgentCacheEntry>();

  constructor(
    @InjectRepository(AiAgent) private readonly agentRepo: Repository<AiAgent>,
    private readonly router: ModelRouterService,
    private readonly usageLog: UsageLogService,
    private readonly searchExecutor: SearchExecutorService
  ) {}

  private async resolveAgent(code: string): Promise<AiAgent | null> {
    const cached = this.agentCache.get(code);
    if (cached && Date.now() - cached.at <= AGENT_CACHE_TTL_MS) {
      return cached.agent;
    }
    let agent: AiAgent | null = null;
    try {
      agent = await this.agentRepo.findOne({ where: { code, status: 1 } });
    } catch {
      agent = null;
    }
    this.agentCache.set(code, { at: Date.now(), agent });
    return agent;
  }

  private async resolveCandidates(
    agent: AiAgent | null,
    preferredModelId?: number | null
  ): Promise<RoutedCandidate[]> {
    try {
      if (preferredModelId) {
        const byPreferred = await this.router.candidatesByModel(preferredModelId);
        if (byPreferred.length > 0) {
          return byPreferred;
        }
      }
      if (agent?.modelId) {
        const byModel = await this.router.candidatesByModel(agent.modelId);
        if (byModel.length > 0) {
          return byModel;
        }
      }
      return await this.router.candidatesByCapability('chat');
    } catch {
      return [];
    }
  }

  /**
   * 流式调用一位专家：候选渠道逐个故障转移，部分输出即收尾（与占卜/对话一致）。
   * 渠道全失败且提供 fallback 时走本地兜底并分片回放以保留前端动画。
   */
  async streamAnalysis(params: StreamCallParams): Promise<StreamCallResult> {
    const { def, userPrompt, userId, onDelta, budgetMs, preferredModelId } = params;
    const agent = await this.resolveAgent(def.code);
    const candidates = await this.resolveCandidates(agent, preferredModelId);

    if (candidates.length > 0) {
      const systemPrompt = agent?.systemPrompt?.trim() || def.systemPrompt;
      const options: ChatRequestOptions = {
        temperature: agent?.temperature != null ? Number(agent.temperature) : Number(def.temperature),
        topP: agent?.topP != null ? Number(agent.topP) : undefined,
        maxTokens: agent?.maxTokens ?? undefined
      };
      const messages: ChatMessagePayload[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      const promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / ESTIMATE_CHARS_PER_TOKEN);
      const startedAt = Date.now();
      let lastError: Error | null = null;

      for (const candidate of candidates) {
        let content = '';
        try {
          content = await this.consumeStream(candidate, messages, options, onDelta, Date.now() + budgetMs);
          if (content.trim().length > 0) {
            this.usageLog.record({
              userId,
              modelId: candidate.model.id || undefined,
              kind: 'roundtable',
              promptTokens,
              completionTokens: Math.ceil(content.length / ESTIMATE_CHARS_PER_TOKEN),
              latencyMs: Date.now() - startedAt,
              status: 'ok'
            });
            return {
              content,
              source: 'llm',
              usedModelId: candidate.model.id || undefined,
              modelLabel: candidate.channel.label
            };
          }
          lastError = new Error('模型返回空内容');
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('模型调用失败');
          this.logger.warn(`${def.name} 渠道 ${candidate.channel.label} 调用失败: ${lastError.message}`);
          if (content.trim().length > 0) {
            // 部分输出按现有内容收尾，不切换渠道。
            this.usageLog.record({
              userId,
              modelId: candidate.model.id || undefined,
              kind: 'roundtable',
              promptTokens,
              completionTokens: Math.ceil(content.length / ESTIMATE_CHARS_PER_TOKEN),
              latencyMs: Date.now() - startedAt,
              status: 'stopped',
              errorMessage: lastError.message.slice(0, 255)
            });
            return {
              content,
              source: 'llm',
              usedModelId: candidate.model.id || undefined,
              modelLabel: candidate.channel.label
            };
          }
        }
      }
      this.usageLog.record({
        userId,
        modelId: candidates[0]?.model.id || undefined,
        kind: 'roundtable',
        promptTokens,
        latencyMs: Date.now() - startedAt,
        status: 'failed',
        errorMessage: (lastError?.message ?? '渠道全部失败').slice(0, 255)
      });
    }

    if (params.fallback) {
      return this.runLocalFallback(params.fallback(), onDelta);
    }
    throw new Error('没有可用的模型渠道，请联系管理员在 AI 管理里配置');
  }

  /** 本地兜底：完整文案分片回放，保留前端逐字动画。 */
  private async runLocalFallback(content: string, onDelta: (text: string) => void): Promise<StreamCallResult> {
    const chunkSize = 16;
    for (let index = 0; index < content.length; index += chunkSize) {
      onDelta(content.slice(index, index + chunkSize));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { content, source: 'local' };
  }

  /** 消费适配器生成器：整体 deadline 保护，超时/异常时已有内容向上抛由调用方收尾。 */
  private async consumeStream(
    candidate: RoutedCandidate,
    messages: ChatMessagePayload[],
    options: ChatRequestOptions,
    onDelta: (text: string) => void,
    deadlineAt: number
  ): Promise<string> {
    let content = '';
    const generator = candidate.adapter.chatStream(messages, options, candidate.channel);
    let timer: NodeJS.Timeout | null = null;
    let rejectOnTimeout: ((error: Error) => void) | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      rejectOnTimeout = reject;
    });
    try {
      for (;;) {
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) {
          throw new Error('生成超时');
        }
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => rejectOnTimeout?.(new Error('生成超时')), remaining);
        const next = await Promise.race([generator.next(), timeoutPromise]);
        if (next.done) {
          return content;
        }
        if (next.value) {
          content += next.value;
          onDelta(next.value);
        }
      }
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /** 主席智能体编码（供外部加载定义）。 */
  get moderatorDefinition(): ExpertDefinition {
    return MODERATOR_DEFINITION;
  }

  /**
   * 消息面调研（非流式，带 web_search 工具，最多 2 轮工具往返）：
   * 有搜索执行器（博查/Tavily key）→ 真联网检索；
   * 没有 → 告知模型工具不可用，基于已知信息（公告标题/常识）做事件提示并标注时效风险。
   * 返回【消息面参考】文本；无可用渠道返回 null。
   */
  async researchNews(params: {
    subjectName: string;
    symbol?: string | null;
    announcements: string[];
    userId: number;
  }): Promise<string | null> {
    const candidates = await this.resolveCandidates(null).catch(() => []);
    if (candidates.length === 0) {
      return null;
    }
    const candidate = candidates[0];
    const { subjectName, symbol, announcements, userId } = params;
    const systemPrompt = [
      '你是股市圆桌会议的"消息面调研员"，职责是会前收集整理分析对象的事件性信息。',
      '要求：只输出一份 150~300 字的【消息面参考】要点（事件 + 方向判断 + 时效标注），',
      '不做技术分析，不给出买卖建议；对无法核实的信息必须标注"未证实"。'
    ].join('');
    const userPrompt = [
      `分析对象：${subjectName}${symbol ? `（${symbol}）` : ''}`,
      announcements.length > 0
        ? `已掌握的官方公告标题：\n${announcements.slice(0, 8).map((t) => `- ${t}`).join('\n')}`
        : '官方公告暂未获取到。',
      '请整理该对象近期值得专家们关注的消息面（财报/公告事件、行业政策、重大新闻、传闻与风险）。'
    ].join('\n');

    const tools = [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: '搜索互联网最新信息（新闻、公告、财报、政策）',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: '搜索关键词' } },
            required: ['query']
          }
        }
      }
    ];

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    const startedAt = Date.now();
    try {
      for (let round = 0; round < 3; round += 1) {
        const response = await fetch(`${candidate.channel.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${candidate.channel.apiKeyPlain}`
          },
          body: JSON.stringify({
            model: candidate.channel.upstreamModel,
            messages,
            tools,
            max_tokens: 800
          }),
          signal: AbortSignal.timeout(60000)
        });
        if (!response.ok) {
          throw new Error(`调研请求失败: ${response.status}`);
        }
        const data = (await response.json()) as {
          choices?: Array<{
            finish_reason?: string;
            message?: {
              content?: string | null;
              tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
            };
          }>;
        };
        const message = data.choices?.[0]?.message;
        const toolCalls = message?.tool_calls ?? [];
        if (data.choices?.[0]?.finish_reason !== 'tool_calls' || toolCalls.length === 0) {
          const content = (message?.content ?? '').trim();
          this.usageLog.record({
            userId,
            modelId: candidate.model.id || undefined,
            kind: 'roundtable',
            latencyMs: Date.now() - startedAt,
            status: 'ok'
          });
          return content.length > 20 ? content : null;
        }
        // 执行工具调用并回填。
        messages.push({ role: 'assistant', content: message?.content ?? '', tool_calls: toolCalls });
        for (const call of toolCalls) {
          let query = '';
          try {
            query = (JSON.parse(call.function?.arguments ?? '{}') as { query?: string }).query ?? '';
          } catch {
            query = '';
          }
          const results = query ? await this.searchExecutor.search(query, 5) : null;
          const toolContent =
            results == null
              ? '搜索工具当前不可用（未配置搜索执行器）。请基于已提供的公告标题与你的既有知识完成整理，'
                + '并明确标注"以下基于模型既有知识，可能不含最新动态"。'
              : JSON.stringify(
                  results.map((item) => ({ title: item.title, snippet: item.snippet, date: item.date }))
                );
          messages.push({ role: 'tool', tool_call_id: call.id ?? '', content: toolContent });
        }
      }
      return null;
    } catch (error) {
      this.logger.warn(`消息面调研失败: ${error instanceof Error ? error.message : '未知错误'}`);
      this.usageLog.record({
        userId,
        modelId: candidate.model.id || undefined,
        kind: 'roundtable',
        latencyMs: Date.now() - startedAt,
        status: 'failed',
        errorMessage: (error instanceof Error ? error.message : '调研失败').slice(0, 255)
      });
      return null;
    }
  }
}
