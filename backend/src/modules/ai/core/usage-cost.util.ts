// 成本计价纯函数：价格生效行选择（resolvePrice）与环境变量默认价解析（parseEnvPrices）。
// 纯函数不依赖 Nest 容器与网络（AGENTS 测试规范第 4 条），供报表 service 与单测复用。
import { AiModelPrice } from '../../../common/entities/ai-model-price.entity';

export type PriceKind = 'chat' | 'image' | 'video' | 'tts';

// roundtable（股市圆桌多智能体）记录 kind 与 chat 不同但计价同口径。
// 导出供报表 service 查价目表前归一 kind（价目表只存 chat/image/video/tts 四种）。
export const CHAT_KINDS = new Set(['chat', 'roundtable']);

// 单价行的缺省计价单位（由 kind 决定，dto 缺省时 service 用它落库）。
export const DEFAULT_UNIT_BY_KIND: Record<PriceKind, string> = {
  chat: 'tokens_1k',
  image: 'image',
  video: 'second',
  tts: 'char'
};

export interface ResolvedPrice {
  inputPrice: number;
  outputPrice: number;
  currency: string;
  unit: string;
}

// 环境变量默认价（单价表无匹配行时的兜底）。
export interface PriceEnvDefaults {
  chat?: { inputPrice: number; outputPrice: number };
  image?: number;
  video?: number;
  tts?: number;
  currency: string;
}

const parseNumber = (raw?: string): number | undefined => {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/** 环境变量默认价解析：缺省/非法值忽略（undefined = 该类无兜底价），币种缺省 CNY。 */
export const parseEnvPrices = (env: Record<string, string | undefined> = process.env): PriceEnvDefaults => {
  const chatInput = parseNumber(env.AI_PRICE_CHAT_INPUT);
  const chatOutput = parseNumber(env.AI_PRICE_CHAT_OUTPUT);
  return {
    chat:
      chatInput !== undefined || chatOutput !== undefined
        ? { inputPrice: chatInput ?? 0, outputPrice: chatOutput ?? 0 }
        : undefined,
    image: parseNumber(env.AI_PRICE_IMAGE),
    video: parseNumber(env.AI_PRICE_VIDEO_PER_SEC),
    tts: parseNumber(env.AI_PRICE_TTS_PER_CHAR),
    currency: env.AI_PRICE_CURRENCY?.trim() || 'CNY'
  };
};

/** 同层候选取 effective_from ≤ at 的最新一行；at 早于全部行则该层无匹配。 */
const pickRow = (rows: AiModelPrice[], at: Date): AiModelPrice | undefined =>
  rows
    .map((row) => ({ row, atMs: new Date(row.effectiveFrom).getTime() }))
    .filter((item) => Number.isFinite(item.atMs) && item.atMs <= at.getTime())
    .sort((a, b) => a.atMs - b.atMs)
    .pop()?.row;

const fromRow = (row: AiModelPrice): ResolvedPrice => ({
  inputPrice: Number(row.inputPrice),
  outputPrice: Number(row.outputPrice),
  currency: row.currency,
  unit: row.unit
});

/**
 * 取价顺序：modelId 行 > kind 全局行（model_id null）> 环境变量默认价 > null。
 * 同层内取生效时间 ≤ at 的最新一行；roundtable 归 chat 价目口径。
 */
export const resolvePrice = (
  kind: string,
  at: Date,
  prices: AiModelPrice[],
  envDefaults?: PriceEnvDefaults,
  modelId?: number
): ResolvedPrice | null => {
  const priceKind: PriceKind = CHAT_KINDS.has(kind) ? 'chat' : (kind as PriceKind);
  const kindRows = prices.filter((row) => row.kind === priceKind);
  const modelRow = pickRow(
    kindRows.filter((row) => row.modelId != null && row.modelId === modelId),
    at
  );
  if (modelRow) {
    return fromRow(modelRow);
  }
  const globalRow = pickRow(
    kindRows.filter((row) => row.modelId == null),
    at
  );
  if (globalRow) {
    return fromRow(globalRow);
  }
  if (envDefaults) {
    const currency = envDefaults.currency || 'CNY';
    if (priceKind === 'chat' && envDefaults.chat) {
      return {
        inputPrice: envDefaults.chat.inputPrice,
        outputPrice: envDefaults.chat.outputPrice,
        currency,
        unit: DEFAULT_UNIT_BY_KIND.chat
      };
    }
    const perUnit =
      priceKind === 'image'
        ? envDefaults.image
        : priceKind === 'video'
          ? envDefaults.video
          : priceKind === 'tts'
            ? envDefaults.tts
            : undefined;
    if (perUnit !== undefined) {
      return { inputPrice: 0, outputPrice: perUnit, currency, unit: DEFAULT_UNIT_BY_KIND[priceKind] };
    }
  }
  return null;
};

/**
 * 金额计算：chat/roundtable = 输入token/1000×输入价 + 输出token/1000×输出价
 * （输入/输出分开计价，不引入交叉项）；image/video/tts = unitCount × 单价
 * （单价表非 chat 行复用 output_price 字段承载每单位价，见 ai-model-price.entity.outputPrice 注释）。
 * 无价（null）返回 null = 报表「未覆盖」口径；token=0 / unitCount=0（失败调用）金额为 0。
 */
export const computeCost = (
  kind: string,
  promptTokens: number,
  completionTokens: number,
  unitCount: number,
  price: ResolvedPrice | null
): number | null => {
  if (!price) {
    return null;
  }
  if (CHAT_KINDS.has(kind)) {
    return (promptTokens / 1000) * price.inputPrice + (completionTokens / 1000) * price.outputPrice;
  }
  return unitCount * price.outputPrice;
};
