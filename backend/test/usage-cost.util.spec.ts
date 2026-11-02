// 成本计价纯函数单测：resolvePrice 生效行选择与环境变量默认价解析（不依赖 Nest 容器与网络）。
// computeCost 与 usage-report service 金额类型断言见 usage-report.service.spec.ts（随模块B同批）。
import { AiModelPrice } from '../src/common/entities/ai-model-price.entity';
import { parseEnvPrices, resolvePrice } from '../src/modules/ai/core/usage-cost.util';

const at = (iso: string): Date => new Date(iso);

const row = (overrides: Partial<AiModelPrice>): AiModelPrice =>
  ({
    id: 1,
    modelId: undefined,
    kind: 'chat',
    inputPrice: '0.000000',
    outputPrice: '0.000000',
    unit: 'tokens_1k',
    currency: 'CNY',
    effectiveFrom: at('2026-01-01T00:00:00.000Z'),
    remark: undefined,
    ...overrides
  }) as AiModelPrice;

describe('parseEnvPrices', () => {
  it('解析六个变量并给默认币种 CNY', () => {
    const parsed = parseEnvPrices({
      AI_PRICE_CHAT_INPUT: '0.001',
      AI_PRICE_CHAT_OUTPUT: '0.002',
      AI_PRICE_IMAGE: '0.5',
      AI_PRICE_VIDEO_PER_SEC: '1.2',
      AI_PRICE_TTS_PER_CHAR: '0.0002',
      AI_PRICE_CURRENCY: 'USD'
    });
    expect(parsed).toEqual({
      chat: { inputPrice: 0.001, outputPrice: 0.002 },
      image: 0.5,
      video: 1.2,
      tts: 0.0002,
      currency: 'USD'
    });
  });

  it('缺省/空串/非法值忽略（undefined = 无兜底价）', () => {
    const parsed = parseEnvPrices({
      AI_PRICE_CHAT_INPUT: 'abc',
      AI_PRICE_IMAGE: '',
      AI_PRICE_VIDEO_PER_SEC: '-3',
      AI_PRICE_TTS_PER_CHAR: '0.1'
    });
    expect(parsed.chat).toBeUndefined();
    expect(parsed.image).toBeUndefined();
    expect(parsed.video).toBeUndefined();
    expect(parsed.tts).toBe(0.1);
    expect(parsed.currency).toBe('CNY');
  });

  it('chat 只有单边配置时缺省边记 0', () => {
    const parsed = parseEnvPrices({ AI_PRICE_CHAT_OUTPUT: '0.02' });
    expect(parsed.chat).toEqual({ inputPrice: 0, outputPrice: 0.02 });
  });
});

describe('resolvePrice', () => {
  const envDefaults = {
    chat: { inputPrice: 0.001, outputPrice: 0.002 },
    image: 0.5,
    video: 1,
    tts: 0.0002,
    currency: 'CNY'
  };

  it('多行生效时间取 ≤ at 的最新一行', () => {
    const prices = [
      row({ id: 1, outputPrice: '0.010000', effectiveFrom: at('2026-01-01T00:00:00.000Z') }),
      row({ id: 2, outputPrice: '0.020000', effectiveFrom: at('2026-06-01T00:00:00.000Z') }),
      row({ id: 3, outputPrice: '0.030000', effectiveFrom: at('2027-01-01T00:00:00.000Z') })
    ];
    // at 落在第二行生效之后、第三行之前：取 id=2。
    const resolved = resolvePrice('chat', at('2026-11-02T00:00:00.000Z'), prices, envDefaults);
    expect(resolved).not.toBeNull();
    expect(resolved?.outputPrice).toBe(0.02);
  });

  it('at 早于全部行时该层无匹配：无 modelId 行则回落 envDefaults', () => {
    const prices = [row({ id: 1, outputPrice: '0.010000', effectiveFrom: at('2026-06-01T00:00:00.000Z') })];
    const resolved = resolvePrice('chat', at('2026-01-15T00:00:00.000Z'), prices, envDefaults);
    expect(resolved).toEqual({ inputPrice: 0.001, outputPrice: 0.002, currency: 'CNY', unit: 'tokens_1k' });
  });

  it('modelId 行优先于 kind 全局行', () => {
    const prices = [
      row({ id: 1, modelId: undefined, outputPrice: '0.100000', effectiveFrom: at('2026-01-01T00:00:00.000Z') }),
      row({ id: 2, modelId: 7, outputPrice: '0.200000', effectiveFrom: at('2026-01-01T00:00:00.000Z') })
    ];
    const resolved = resolvePrice('chat', at('2026-11-02T00:00:00.000Z'), prices, envDefaults, 7);
    expect(resolved?.outputPrice).toBe(0.2);
    // 不传 modelId 时只匹配全局行。
    const globalOnly = resolvePrice('chat', at('2026-11-02T00:00:00.000Z'), prices, envDefaults);
    expect(globalOnly?.outputPrice).toBe(0.1);
  });

  it('无价格行时回落 envDefaults（image 单价承载在 outputPrice）', () => {
    const resolved = resolvePrice('image', at('2026-11-02T00:00:00.000Z'), [], envDefaults);
    expect(resolved).toEqual({ inputPrice: 0, outputPrice: 0.5, currency: 'CNY', unit: 'image' });
    expect(resolvePrice('video', at('2026-11-02T00:00:00.000Z'), [], envDefaults)?.unit).toBe('second');
    expect(resolvePrice('tts', at('2026-11-02T00:00:00.000Z'), [], envDefaults)?.unit).toBe('char');
  });

  it('无价格行且无 envDefaults 返回 null；envDefaults 该类无值也返回 null', () => {
    expect(resolvePrice('chat', at('2026-11-02T00:00:00.000Z'), [])).toBeNull();
    expect(resolvePrice('video', at('2026-11-02T00:00:00.000Z'), [], { currency: 'CNY' })).toBeNull();
  });

  it('roundtable 归 chat 价目口径', () => {
    const prices = [row({ id: 1, outputPrice: '0.010000', effectiveFrom: at('2026-01-01T00:00:00.000Z') })];
    const resolved = resolvePrice('roundtable', at('2026-11-02T00:00:00.000Z'), prices, envDefaults);
    expect(resolved).not.toBeNull();
    expect(resolved?.outputPrice).toBe(0.01);
    // 兜底路径同样归 chat。
    const fallback = resolvePrice('roundtable', at('2026-11-02T00:00:00.000Z'), [], envDefaults);
    expect(fallback).toEqual({ inputPrice: 0.001, outputPrice: 0.002, currency: 'CNY', unit: 'tokens_1k' });
  });
});

