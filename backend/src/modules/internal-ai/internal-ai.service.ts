// 内部 AI 服务：把 flow 引擎依赖的模型调用面（runLlm / 生图 / TTS）收口为阻塞式 HTTP 接口。
// 逻辑与 flow/engine/node-handlers 保持一致：多候选故障转移 + 可调超时预算 + 用量记录。
// Go↔Node 之间无需流式（引擎只消费聚合后的完整文本），这是上一轮方案的关键结论。
//
// 超时语义（两层，勿混淆）：
//   - 上游硬上限 = adapter 内 fetch 的 AbortSignal.timeout(120s)（openai-compatible.adapter 的
//     STREAM_TIMEOUT_MS），任何单次上游调用 120s 必被掐断；
//   - 本层超时是「多候选故障转移预算」：单个候选超预算即放弃并切下一个候选，因此应 ≥ adapter 上限；
//     Go 侧等待预算请按 ≥300s 配置（最坏情况 = 候选数 × 本层超时）。
//   - 预算可经 INTERNAL_AI_CHAT_TIMEOUT_MS / INTERNAL_AI_IMAGE_TIMEOUT_MS 调整（默认 180s/300s，
//     每次调用时读取便于测试注入）；TTS 与 image 共用 IMAGE 预算（与历史行为一致）。
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ChatMessagePayload,
  ChatRequestOptions
} from '../ai/core/llm-adapter.interface';
import { ModelRouterService, RoutedCandidate } from '../ai/core/model-router.service';
import { UsageLogService } from '../ai/core/usage-log.service';
import { InternalChatDto, InternalImageDto, InternalTtsDto } from './dto/internal-ai.dto';

const DEFAULT_CHAT_TIMEOUT_MS = 180000;
const DEFAULT_IMAGE_TIMEOUT_MS = 300000;

// 每次调用时读环境变量（非启动期常量），便于按请求注入测试预算；非法值回落默认。
const readTimeoutMs = (envKey: string, fallback: number): number => {
  const parsed = Number(process.env[envKey]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

@Injectable()
export class InternalAiService {
  private readonly logger = new Logger(InternalAiService.name);

  constructor(
    private readonly router: ModelRouterService,
    private readonly usageLog: UsageLogService
  ) {}

  /**
   * promise 与超时竞速：胜者出炉后 finally 必 clearTimeout，
   * 杜绝每轮 Promise.race 泄漏 pending timer（高频调用积压）。
   */
  private async raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label}超时`)), Math.max(1, timeoutMs));
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 阻塞式对话生成：聚合完整文本后返回（多候选逐个故障转移）。 */
  async chat(dto: InternalChatDto): Promise<{ text: string; modelId?: number }> {
    const candidates = await this.chatCandidates(dto.modelId);
    const options: ChatRequestOptions = { temperature: dto.temperature ?? 0.7 };
    const startedAt = Date.now();
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      const generator = candidate.adapter.chatStream(
        dto.messages as ChatMessagePayload[],
        options,
        candidate.channel
      );
      try {
        let text = '';
        // 单候选总预算：每轮 next() 用「预算起点起的剩余时间」竞速（预算内多轮聚合）。
        const deadline = Date.now() + readTimeoutMs('INTERNAL_AI_CHAT_TIMEOUT_MS', DEFAULT_CHAT_TIMEOUT_MS);
        for (;;) {
          const next = await this.raceWithTimeout(generator.next(), deadline - Date.now(), '生成');
          if (next.done) {
            break;
          }
          text += next.value;
        }
        this.usageLog.record({
          userId: dto.userId,
          modelId: candidate.model.id,
          kind: 'chat',
          latencyMs: Date.now() - startedAt,
          status: 'ok'
        });
        return { text, modelId: candidate.model.id };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.usageLog.record({
          userId: dto.userId,
          modelId: candidate.model.id,
          kind: 'chat',
          latencyMs: Date.now() - startedAt,
          status: 'failed',
          errorMessage: lastError.message
        });
        this.logger.warn(`内部 chat 候选 ${candidate.model.id} 失败: ${lastError.message}`);
        // 尽早终止当前候选（触发上游流清理）；不 await——生成器可能停在永久挂起的
        // 上游读上，等它结算会拖垮故障转移，故 fire-and-forget（.catch 吞清理期错误）。
        void generator.return?.(undefined).catch(() => undefined);
      }
    }
    throw new ServiceUnavailableException(lastError?.message ?? '生成失败');
  }

  /** 阻塞式生图：返回图片 URL 列表。 */
  async image(dto: InternalImageDto): Promise<{ images: { url: string }[]; modelId?: number }> {
    const candidates = dto.modelId
      ? await this.router.candidatesByModel(dto.modelId)
      : await this.router.candidatesByCapability('image');
    const usable = candidates.filter((candidate) => candidate.adapter.images);
    if (usable.length === 0) {
      throw new ServiceUnavailableException('没有可用的生图模型，请在 AI 模型管理里配置 image 能力模型');
    }

    const startedAt = Date.now();
    let lastError: Error | null = null;
    for (const candidate of usable) {
      const generate = candidate.adapter.images?.bind(candidate.adapter);
      if (!generate) {
        continue;
      }
      try {
        const results = await this.raceWithTimeout(
          generate(
            {
              prompt: dto.prompt,
              size: dto.size,
              count: dto.count ?? 1,
              referenceImages: dto.referenceImages
            },
            candidate.channel
          ),
          readTimeoutMs('INTERNAL_AI_IMAGE_TIMEOUT_MS', DEFAULT_IMAGE_TIMEOUT_MS),
          '生图'
        );
        this.usageLog.record({
          userId: dto.userId,
          modelId: candidate.model.id,
          kind: 'image',
          latencyMs: Date.now() - startedAt,
          status: 'ok'
        });
        return { images: results.map((item) => ({ url: item.url })), modelId: candidate.model.id };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.usageLog.record({
          userId: dto.userId,
          modelId: candidate.model.id,
          kind: 'image',
          latencyMs: Date.now() - startedAt,
          status: 'failed',
          errorMessage: lastError.message
        });
        this.logger.warn(`内部 image 候选 ${candidate.model.id} 失败: ${lastError.message}`);
      }
    }
    throw new ServiceUnavailableException(lastError?.message ?? '生图失败');
  }

  /** 阻塞式语音合成：返回 base64 音频（OpenAI 兼容 /audio/speech 渠道）。 */
  async tts(dto: InternalTtsDto): Promise<{ audioBase64: string; mime: string; modelId?: number }> {
    const candidates = dto.modelId
      ? await this.router.candidatesByModel(dto.modelId)
      : await this.router.candidatesByCapability('tts');
    const usable = candidates.filter((candidate) => candidate.adapter.speech);
    if (usable.length === 0) {
      throw new ServiceUnavailableException('没有可用的语音模型，请在 AI 模型管理里配置 tts 能力模型');
    }

    const startedAt = Date.now();
    let lastError: Error | null = null;
    for (const candidate of usable) {
      const synthesize = candidate.adapter.speech?.bind(candidate.adapter);
      if (!synthesize) {
        continue;
      }
      try {
        const result = await this.raceWithTimeout(
          synthesize({ text: dto.text, voice: dto.voice, speed: dto.speed }, candidate.channel),
          readTimeoutMs('INTERNAL_AI_IMAGE_TIMEOUT_MS', DEFAULT_IMAGE_TIMEOUT_MS),
          '语音合成'
        );
        this.usageLog.record({
          userId: dto.userId,
          modelId: candidate.model.id,
          kind: 'tts',
          latencyMs: Date.now() - startedAt,
          status: 'ok'
        });
        return { ...result, modelId: candidate.model.id };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.usageLog.record({
          userId: dto.userId,
          modelId: candidate.model.id,
          kind: 'tts',
          latencyMs: Date.now() - startedAt,
          status: 'failed',
          errorMessage: lastError.message
        });
        this.logger.warn(`内部 tts 候选 ${candidate.model.id} 失败: ${lastError.message}`);
      }
    }
    throw new ServiceUnavailableException(lastError?.message ?? '语音合成失败');
  }

  private async chatCandidates(modelId?: number): Promise<RoutedCandidate[]> {
    const candidates = modelId
      ? await this.router.candidatesByModel(modelId)
      : await this.router.candidatesByCapability('chat');
    const usable = candidates.filter((candidate) => candidate.adapter.chatStream);
    if (usable.length === 0) {
      throw new ServiceUnavailableException('没有可用的对话模型，请在 AI 模型管理里配置 chat 能力模型');
    }
    return usable;
  }
}
