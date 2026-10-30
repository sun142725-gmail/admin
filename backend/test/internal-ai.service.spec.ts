// InternalAiService 单元测试：纯 DI stub，不起 HTTP/DB/Nest 容器（AGENTS 规则 1）。
// 覆盖：多候选故障转移（第一候选挂起→超时切第二候选 + generator.return 终止当前候选）、
// 成功路径 race 定时器全清（回归每轮 Promise.race 泄漏 pending timer）、image 全候选挂起→超时降级。
import { InternalAiService } from '../src/modules/internal-ai/internal-ai.service';
import { ModelRouterService, RoutedCandidate } from '../src/modules/ai/core/model-router.service';
import { UsageLogService } from '../src/modules/ai/core/usage-log.service';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { LlmAdapter } from '../src/modules/ai/core/llm-adapter.interface';
import { InternalChatDto, InternalImageDto } from '../src/modules/internal-ai/dto/internal-ai.dto';

/** 永久挂起的 chatStream：模拟上游无响应（本层超时预算负责掐断并切换候选）。 */
const makeHangingChatAdapter = (): { adapter: LlmAdapter; returnSpy: jest.Mock } => {
  const state: { returnSpy: jest.Mock } = { returnSpy: undefined as unknown as jest.Mock };
  const gen = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next: () => new Promise<IteratorResult<string>>(() => undefined),
    return: async (value?: unknown) => {
      state.returnSpy(value);
      return { done: true, value } as IteratorReturnResult<unknown>;
    },
    throw: async (error?: unknown) => {
      throw error;
    }
  };
  state.returnSpy = jest.fn();
  const adapter = {
    type: 'fake-hang',
    chatStream: () => gen as unknown as AsyncGenerator<string>,
    probe: async () => ({ ok: true })
  } as unknown as LlmAdapter;
  return { adapter, returnSpy: state.returnSpy };
};

/** 立即完成的 chatStream：产出固定文本。 */
const makeEchoChatAdapter = (text: string): LlmAdapter =>
  ({
    type: 'fake-ok',
    chatStream: async function* () {
      yield text;
    },
    probe: async () => ({ ok: true })
  }) as unknown as LlmAdapter;

/** 永久挂起的 images：模拟生图上游无响应。 */
const makeHangingImageAdapter = (): LlmAdapter =>
  ({
    type: 'fake-hang-image',
    images: () => new Promise(() => undefined),
    probe: async () => ({ ok: true })
  }) as unknown as LlmAdapter;

const candidate = (modelId: number, adapter: LlmAdapter): RoutedCandidate => ({
  model: { id: modelId } as AiModel,
  adapter,
  channel: {
    modelRowId: modelId,
    label: `model-${modelId}`,
    type: adapter.type,
    baseUrl: 'http://upstream.invalid',
    apiKeyPlain: 'key',
    upstreamModel: 'fake-model'
  }
});

const makeRouter = (candidates: RoutedCandidate[]): ModelRouterService =>
  ({
    candidatesByCapability: jest.fn().mockResolvedValue(candidates),
    candidatesByModel: jest.fn().mockResolvedValue(candidates)
  }) as unknown as ModelRouterService;

const makeUsage = (): { service: UsageLogService; record: jest.Mock } => {
  const record = jest.fn();
  return { service: { record } as unknown as UsageLogService, record };
};

describe('InternalAiService（纯 DI 单测）', () => {
  afterEach(() => {
    delete process.env.INTERNAL_AI_CHAT_TIMEOUT_MS;
    delete process.env.INTERNAL_AI_IMAGE_TIMEOUT_MS;
    jest.restoreAllMocks();
  });

  const chatDto = (): InternalChatDto => ({ userId: 1, messages: [{ role: 'user', content: '你好' }] }) as InternalChatDto;

  it('第一候选挂起 + INTERNAL_AI_CHAT_TIMEOUT_MS 调小：超时切第二候选（故障转移）', async () => {
    process.env.INTERNAL_AI_CHAT_TIMEOUT_MS = '80';
    const { record, service: usage } = makeUsage();
    const service = new InternalAiService(
      makeRouter([candidate(1, makeHangingChatAdapter().adapter), candidate(2, makeEchoChatAdapter('第二候选文本'))]),
      usage
    );
    const result = await service.chat(chatDto());
    expect(result).toEqual({ text: '第二候选文本', modelId: 2 });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ modelId: 1, status: 'failed' }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ modelId: 2, status: 'ok' }));
  });

  it('超时分支调用 generator.return 尽早终止当前候选', async () => {
    process.env.INTERNAL_AI_CHAT_TIMEOUT_MS = '80';
    const hang = makeHangingChatAdapter();
    const service = new InternalAiService(
      makeRouter([candidate(1, hang.adapter), candidate(2, makeEchoChatAdapter('ok'))]),
      makeUsage().service
    );
    await service.chat(chatDto());
    expect(hang.returnSpy).toHaveBeenCalledTimes(1);
  });

  it('成功路径：所有已注册的 race 定时器全部被清（回归 timer 泄漏）', async () => {
    const realSetTimeout = global.setTimeout.bind(global);
    const realClearTimeout = global.clearTimeout.bind(global);
    const created: Array<unknown> = [];
    const cleared: Array<unknown> = [];
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      const timer = realSetTimeout(fn, ms);
      created.push(timer);
      return timer;
    }) as unknown as typeof global.setTimeout);
    jest.spyOn(global, 'clearTimeout').mockImplementation(((timer?: unknown) => {
      cleared.push(timer);
      realClearTimeout(timer as NodeJS.Timeout);
    }) as unknown as typeof global.clearTimeout);

    const service = new InternalAiService(makeRouter([candidate(1, makeEchoChatAdapter('ok'))]), makeUsage().service);
    const result = await service.chat(chatDto());
    expect(result.text).toBe('ok');
    expect(created.length).toBeGreaterThan(0);
    for (const timer of created) {
      expect(cleared).toContain(timer); // 修复前：每轮 race 的 180s pending timer 泄漏
    }
  });

  it('image 全候选挂起 + INTERNAL_AI_IMAGE_TIMEOUT_MS 调小：超时后 503 可读降级', async () => {
    process.env.INTERNAL_AI_IMAGE_TIMEOUT_MS = '80';
    const { record, service: usage } = makeUsage();
    const service = new InternalAiService(makeRouter([candidate(1, makeHangingImageAdapter())]), usage);
    const dto = { userId: 1, prompt: '测试生图' } as InternalImageDto;
    await expect(service.image(dto)).rejects.toThrow('生图超时');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ modelId: 1, status: 'failed' }));
  });
});
