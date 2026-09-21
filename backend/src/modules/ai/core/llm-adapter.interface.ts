// LLM 适配器统一接口：新增厂商优先判断是否 OpenAI 兼容（零代码），否则实现本接口注册。
export interface ResolvedChannel {
  // 命中的模型行（dify 智能体直连时为空）。
  modelRowId?: number;
  // 展示名（模型 displayName 或智能体名），用于日志与排障。
  label: string;
  type: string;
  baseUrl: string;
  apiKeyPlain: string;
  // 请求上游时使用的模型名（openai 兼容协议的 model 字段）。
  upstreamModel: string;
}

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequestOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface ChatStreamResult {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface ImageRequestOptions {
  prompt: string;
  size?: string;
  count?: number;
}

export interface ImageResult {
  url: string;
}

export interface ProbeResult {
  ok: boolean;
  models?: string[];
  message?: string;
}

export interface LlmAdapter {
  readonly type: string;
  chatStream(
    messages: ChatMessagePayload[],
    options: ChatRequestOptions,
    channel: ResolvedChannel
  ): AsyncGenerator<string>;
  images?(options: ImageRequestOptions, channel: ResolvedChannel): Promise<ImageResult[]>;
  probe(channel: ResolvedChannel): Promise<ProbeResult>;
}
