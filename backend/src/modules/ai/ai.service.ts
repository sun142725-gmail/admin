// AI 服务用于调用 DeepSeek/OpenAI 生成解卦文本，支持整段与流式两种输出。
// 优先走 divination 场景智能体（提示词 + 绑定模型路由），其次任意 chat 模型路由，
// 未配置时回落到环境变量直连，最终降级本地文案。
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgent } from '../../common/entities/ai-agent.entity';
import { ModelRouterService, RoutedCandidate } from './core/model-router.service';
import { ChatRequestOptions } from './core/llm-adapter.interface';

interface LinePayload {
  signStr: string;
  symbol: string;
  name: string;
  sum?: number;
}

const STREAM_TIMEOUT_MS = 60000;

interface HexagramContext {
  hexagramName?: string | null;
  changedHexagramName?: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiAgent) private readonly agentRepo: Repository<AiAgent>,
    private readonly router: ModelRouterService
  ) {}

  /** divination 业务编码的启用智能体（未配置返回 null）。 */
  private async findDivinationAgent(): Promise<AiAgent | null> {
    try {
      return await this.agentRepo.findOne({ where: { code: 'divination', status: 1 } });
    } catch {
      return null;
    }
  }

  /**
   * 管理端路由优先的流式生成：divination 场景智能体（提示词/采样参数/绑定模型）> 任意 chat 模型。
   * 无候选渠道时返回 null（由调用方回落旧逻辑）。
   * 注意：必须是普通 async 方法（返回生成器或 null），若声明为 async generator，return null 会变成“空流”而非 null。
   */
  private async buildRoutedStream(
    defaultSystemPrompt: string,
    userPrompt: string
  ): Promise<AsyncGenerator<string> | null> {
    let agent: AiAgent | null = null;
    try {
      agent = await this.findDivinationAgent();
    } catch {
      agent = null;
    }

    let candidates: RoutedCandidate[] = [];
    if (agent?.modelId) {
      try {
        candidates = await this.router.candidatesByModel(agent.modelId);
      } catch {
        candidates = [];
      }
    }
    if (candidates.length === 0) {
      try {
        candidates = await this.router.candidatesByCapability('chat');
      } catch {
        return null;
      }
    }
    if (candidates.length === 0) {
      return null;
    }

    const systemPrompt = agent?.systemPrompt?.trim() || defaultSystemPrompt;
    const options: ChatRequestOptions = {
      temperature: agent?.temperature != null ? Number(agent.temperature) : undefined,
      topP: agent?.topP != null ? Number(agent.topP) : undefined,
      maxTokens: agent?.maxTokens ?? undefined
    };
    const self = this;
    async function* run(): AsyncGenerator<string> {
      for (const candidate of candidates) {
        let yielded = false;
        try {
          for await (const delta of candidate.adapter.chatStream(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            options,
            candidate.channel
          )) {
            yielded = true;
            yield delta;
          }
          if (yielded) {
            return;
          }
        } catch (error) {
          self.logger.warn(`管理端模型流式调用失败: ${candidate.channel.label}`);
          if (yielded) {
            return; // 部分输出按现有内容收尾。
          }
        }
      }
      throw new Error('所有管理端渠道均调用失败');
    }
    return run();
  }

  async interpret(lines: LinePayload[], topic?: string, hexagram?: HexagramContext) {
    const providers = this.getProviders();
    if (providers.length === 0) {
      return this.fallbackInterpretation(lines, topic, hexagram);
    }

    for (const provider of providers) {
      try {
        const content = await this.request(provider, lines, topic, hexagram);
        if (content) {
          return content;
        }
      } catch (error) {
        this.logger.warn(`AI 调用失败: ${provider.name}`);
      }
    }

    return this.fallbackInterpretation(lines, topic, hexagram);
  }

  // 流式解卦：逐段产出文本，优先管理端路由，其次环境变量直连，失败时降级为分片输出本地文案。
  async *interpretStream(
    lines: LinePayload[],
    topic?: string,
    hexagram?: HexagramContext
  ): AsyncGenerator<string> {
    const systemPrompt = '你是专业的易经六爻解读助手，输出简洁中文解读。';
    const userPrompt = this.buildPrompt(lines, topic, hexagram);
    const routed = await this.buildRoutedStream(systemPrompt, userPrompt);
    if (routed) {
      try {
        yield* routed;
        return;
      } catch (error) {
        this.logger.warn('管理端路由全部失败，回落环境变量直连');
        // 继续走旧逻辑（含本地兑底）。
      }
    }

    const providers = this.getProviders();
    if (providers.length === 0) {
      yield* this.fallbackStream(lines, topic, hexagram);
      return;
    }

    for (const provider of providers) {
      let yielded = false;
      try {
        for await (const chunk of this.requestStream(provider, lines, topic, hexagram)) {
          yielded = true;
          yield chunk;
        }
        if (yielded) {
          return;
        }
      } catch (error) {
        this.logger.warn(`AI 流式调用失败: ${provider.name}`);
        if (yielded) {
          // 已产出部分内容，交由上层按现有内容收尾。
          return;
        }
      }
    }

    yield* this.fallbackStream(lines, topic, hexagram);
  }

  private getProviders() {
    const providers: Array<{ name: string; baseUrl: string; apiKey: string; model: string }> = [];
    if (process.env.DEEPSEEK_API_KEY) {
      providers.push({
        name: 'deepseek',
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
      });
    }
    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: 'openai',
        baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
      });
    }
    return providers;
  }

  private async request(
    provider: { name: string; baseUrl: string; apiKey: string; model: string },
    lines: LinePayload[],
    topic?: string,
    hexagram?: HexagramContext
  ) {
    const prompt = this.buildPrompt(lines, topic, hexagram);
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: 'system',
            content: '你是专业的易经六爻解读助手，输出简洁中文解读。'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI 请求失败: ${response.status} ${errorText}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim();
  }

  private async *requestStream(
    provider: { name: string; baseUrl: string; apiKey: string; model: string },
    lines: LinePayload[],
    topic?: string,
    hexagram?: HexagramContext
  ): AsyncGenerator<string> {
    const prompt = this.buildPrompt(lines, topic, hexagram);
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: 'system',
            content: '你是专业的易经六爻解读助手，输出简洁中文解读。'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        stream: true
      }),
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI 请求失败: ${response.status} ${errorText}`);
    }
    if (!response.body) {
      throw new Error('AI 响应缺少流内容');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const rawLine of parts) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) {
          continue;
        }
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        } catch {
          // 忽略无法解析的片段。
        }
      }
    }
  }

  private async *fallbackStream(
    lines: LinePayload[],
    topic?: string,
    hexagram?: HexagramContext
  ): AsyncGenerator<string> {
    const text = this.fallbackInterpretation(lines, topic, hexagram);
    for (let index = 0; index < text.length; index += 12) {
      yield text.slice(index, index + 12);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  private buildPrompt(lines: LinePayload[], topic?: string, hexagram?: HexagramContext) {
    const linesText = lines
      .map((line, index) => `第${index + 1}爻：${line.name} ${line.symbol} ${line.signStr}`)
      .join('\n');
    const movingCount = lines.filter((line) => line.symbol === 'O' || line.symbol === '×').length;
    const hexText = hexagram?.hexagramName
      ? `本卦：${hexagram.hexagramName}\n变卦：${
          hexagram.changedHexagramName ?? '无（六爻安静）'
        }\n动爻数：${movingCount}\n`
      : '';
    const hexHint = hexagram?.hexagramName
      ? `请先点明${hexagram.hexagramName}卦意${
          hexagram.changedHexagramName
            ? `，再结合动爻说明向${hexagram.changedHexagramName}的转变`
            : ''
        }`
      : '请给出简短解读';
    return `占卜主题：${topic ?? '未提供'}\n${hexText}${linesText}\n${hexHint}，给出简短解卦建议（2-4 句）。`;
  }

  private fallbackInterpretation(
    lines: LinePayload[],
    topic?: string,
    hexagram?: HexagramContext
  ) {
    const counts: Record<string, number> = { 老阳: 0, 老阴: 0, 少阳: 0, 少阴: 0 };
    lines.forEach((line) => {
      if (counts[line.name] !== undefined) {
        counts[line.name] += 1;
      }
    });
    const dominant = Object.keys(counts).reduce((a, b) =>
      counts[a] >= counts[b] ? a : b
    );
    const hexText = hexagram?.hexagramName ? `本卦${hexagram.hexagramName}，` : '';
    return `占卜主题：${topic ?? '未提供'}。${hexText}六爻以“${dominant}”为主，建议保持平衡心态，顺势而为。`;
  }
}
