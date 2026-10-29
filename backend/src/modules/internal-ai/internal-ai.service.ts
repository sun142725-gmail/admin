// 内部 AI 服务：把 flow 引擎依赖的模型调用面（runLlm / 生图）收口为阻塞式 HTTP 接口。
// 逻辑与 flow/engine/node-handlers 保持一致：多候选故障转移 + 180s 超时 + 用量记录。
// Go↔Node 之间无需流式（引擎只消费聚合后的完整文本），这是上一轮方案的关键结论。
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ChatMessagePayload,
  ChatRequestOptions
} from '../ai/core/llm-adapter.interface';
import { ModelRouterService, RoutedCandidate } from '../ai/core/model-router.service';
import { UsageLogService } from '../ai/core/usage-log.service';
import { InternalChatDto, InternalImageDto, InternalTtsDto } from './dto/internal-ai.dto';

const CHAT_DEADLINE_MS = 180000;
const IMAGE_TIMEOUT_MS = 300000;

@Injectable()
export class InternalAiService {
  private readonly logger = new Logger(InternalAiService.name);

  constructor(
    private readonly router: ModelRouterService,
    private readonly usageLog: UsageLogService
  ) {}

  /** 阻塞式对话生成：聚合完整文本后返回（多候选逐个故障转移）。 */
  async chat(dto: InternalChatDto): Promise<{ text: string; modelId?: number }> {
    const candidates = await this.chatCandidates(dto.modelId);
    const options: ChatRequestOptions = { temperature: dto.temperature ?? 0.7 };
    const startedAt = Date.now();
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        let text = '';
        const generator = candidate.adapter.chatStream(
          dto.messages as ChatMessagePayload[],
          options,
          candidate.channel
        );
        const deadline = Date.now() + CHAT_DEADLINE_MS;
        for (;;) {
          const next = await Promise.race([
            generator.next(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('生成超时')), Math.max(1, deadline - Date.now()))
            )
          ]);
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
        const results = await Promise.race([
          generate(
            {
              prompt: dto.prompt,
              size: dto.size,
              count: dto.count ?? 1,
              referenceImages: dto.referenceImages
            },
            candidate.channel
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('生图超时')), IMAGE_TIMEOUT_MS)
          )
        ]);
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
        const result = await Promise.race([
          synthesize({ text: dto.text, voice: dto.voice, speed: dto.speed }, candidate.channel),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('语音合成超时')), IMAGE_TIMEOUT_MS)
          )
        ]);
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
