// 节点处理器：按类型执行单个节点（输入渲染 → 上游调用 → 结构化输出）。
// 上下文 context = { 节点ID: 输出对象 }，模板 {{nodeId.field}} 从中取值。
import { ChatMessagePayload, ChatRequestOptions } from '../../ai/core/llm-adapter.interface';
import { ModelRouterService, RoutedCandidate } from '../../ai/core/model-router.service';
import { UsageLogService } from '../../ai/core/usage-log.service';
import { GraphNode, renderTemplate } from './dag.util';
import { VideoUpstreamService } from './video-upstream.service';

export interface NodeExecInput {
  userId: number;
  node: GraphNode;
  context: Record<string, Record<string, unknown>>;
  // 开始节点入参（仅 start 使用）。
  inputs: Record<string, unknown>;
  deps: NodeHandlerDependencies;
}

export interface NodeExecResult {
  output: Record<string, unknown>;
  modelId?: number;
}

export interface NodeHandlerDependencies {
  router: ModelRouterService;
  usageLog: UsageLogService;
  video: VideoUpstreamService;
}

const CHAT_DEADLINE_MS = 180000;

const render = (template: string, context: NodeExecInput['context']): string => {
  const missing: string[] = [];
  const rendered = renderTemplate(template, context, (ref) => missing.push(ref));
  if (missing.length > 0) {
    throw new Error(`变量 {{${missing[0]}}} 未定义：上游节点未执行或字段不存在`);
  }
  return rendered;
};

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** 提取 LLM 回复中的 JSON 块（容忍 ```json 围栏与前后说明文字）。 */
export const parseJsonBlock = (text: string): unknown => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return undefined;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
};

/**
 * 通用 LLM 调用（流式聚合为完整回复，多候选故障转移）。
 * 供 llm 节点与小说流水线等业务方共用。
 */
export async function runLlm(
  deps: NodeHandlerDependencies,
  messages: ChatMessagePayload[],
  options: ChatRequestOptions & { modelId?: number; userId?: number }
): Promise<{ text: string; modelId?: number }> {
  const candidates = options.modelId
    ? await deps.router.candidatesByModel(options.modelId)
    : await deps.router.candidatesByCapability('chat');
  const usable = candidates.filter((candidate) => candidate.adapter.chatStream);
  if (usable.length === 0) {
    throw new Error('没有可用的对话模型，请在 AI 模型管理里配置 chat 能力模型');
  }
  const startedAt = Date.now();
  let lastError: Error | null = null;
  for (const candidate of usable) {
    try {
      let text = '';
      const generator = candidate.adapter.chatStream(messages, options, candidate.channel);
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
      deps.usageLog.record({
        userId: options.userId ?? 0,
        modelId: candidate.model.id,
        kind: 'chat',
        latencyMs: Date.now() - startedAt,
        status: 'ok'
      });
      return { text, modelId: candidate.model.id };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      deps.usageLog.record({
        userId: options.userId ?? 0,
        modelId: candidate.model.id,
        kind: 'chat',
        latencyMs: Date.now() - startedAt,
        status: 'failed',
        errorMessage: lastError.message
      });
    }
  }
  throw lastError ?? new Error('生成失败');
}

// ---------- start：输出 = 开始变量（入参或缺省值） ----------
const startHandler = async (input: NodeExecInput): Promise<NodeExecResult> => {
  const variables = Array.isArray(input.node.config.variables) ? input.node.config.variables : [];
  const output: Record<string, unknown> = {};
  for (const raw of variables) {
    const variable = raw as { name?: unknown; defaultValue?: unknown };
    const name = str(variable.name);
    if (!name) {
      continue;
    }
    const provided = input.inputs[name];
    output[name] = provided !== undefined && provided !== '' ? provided : variable.defaultValue ?? '';
  }
  return { output };
};

// ---------- llm：模板渲染 → chat 候选逐个故障转移，聚合完整回复 ----------
const llmHandler = async (input: NodeExecInput): Promise<NodeExecResult> => {
  const prompt = render(str(input.node.config.prompt), input.context);
  const messages: ChatMessagePayload[] = [];
  const systemPrompt = str(input.node.config.systemPrompt);
  if (systemPrompt) {
    messages.push({ role: 'system', content: render(systemPrompt, input.context) });
  }
  messages.push({ role: 'user', content: prompt });

  const modelId = input.node.config.modelId as number | undefined;
  const candidates = modelId
    ? await input.deps.router.candidatesByModel(modelId)
    : await input.deps.router.candidatesByCapability('chat');
  const usable = candidates.filter((candidate) => candidate.adapter.chatStream);
  if (usable.length === 0) {
    throw new Error('没有可用的对话模型，请在 AI 模型管理里配置 chat 能力模型');
  }

  const options: ChatRequestOptions = {
    temperature: num(input.node.config.temperature, 0.7)
  };
  const startedAt = Date.now();
  let lastError: Error | null = null;
  for (const candidate of usable) {
    try {
      let text = '';
      const generator = candidate.adapter.chatStream(messages, options, candidate.channel);
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
      input.deps.usageLog.record({
        userId: input.userId,
        modelId: candidate.model.id,
        kind: 'chat',
        latencyMs: Date.now() - startedAt,
        status: 'ok'
      });
      // JSON 模式：解析结构化输出，字段平铺供下游 {{节点.字段}} 引用。
      if (str(input.node.config.outputFormat) === 'json') {
        const parsed = parseJsonBlock(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('LLM 输出不是合法的 JSON 对象，请调整提示词要求其只输出 JSON');
        }
        return { output: { text, ...(parsed as Record<string, unknown>) }, modelId: candidate.model.id };
      }
      return { output: { text }, modelId: candidate.model.id };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      input.deps.usageLog.record({
        userId: input.userId,
        modelId: candidate.model.id,
        kind: 'chat',
        latencyMs: Date.now() - startedAt,
        status: 'failed',
        errorMessage: lastError.message
      });
    }
  }
  throw lastError ?? new Error('生成失败');
};

// ---------- image：分镜首帧/插画生成，输出 images 数组 ----------
const imageHandler = async (input: NodeExecInput): Promise<NodeExecResult> => {
  const prompt = render(str(input.node.config.prompt), input.context);
  const modelId = input.node.config.modelId as number | undefined;
  const candidates = modelId
    ? await input.deps.router.candidatesByModel(modelId)
    : await input.deps.router.candidatesByCapability('image');
  const usable = candidates.filter((candidate) => candidate.adapter.images);
  if (usable.length === 0) {
    throw new Error('没有可用的生图模型，请在 AI 模型管理里配置 image 能力模型');
  }

  const startedAt = Date.now();
  let lastError: Error | null = null;
  for (const candidate of usable) {
    const generate = candidate.adapter.images?.bind(candidate.adapter);
    if (!generate) {
      continue;
    }
    try {
      const results = await generate(
        {
          prompt,
          size: str(input.node.config.size) || undefined,
          count: num(input.node.config.count, 1)
        },
        candidate.channel
      );
      input.deps.usageLog.record({
        userId: input.userId,
        modelId: candidate.model.id,
        kind: 'image',
        latencyMs: Date.now() - startedAt,
        status: 'ok'
      });
      return {
        output: { images: results.map((item) => ({ url: item.url })), url: results[0]?.url },
        modelId: candidate.model.id
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      input.deps.usageLog.record({
        userId: input.userId,
        modelId: candidate.model.id,
        kind: 'image',
        latencyMs: Date.now() - startedAt,
        status: 'failed',
        errorMessage: lastError.message
      });
    }
  }
  throw lastError ?? new Error('生图失败');
};

// ---------- video：文生/图生视频（提交 → 轮询 → 取回） ----------
const videoHandler = async (input: NodeExecInput): Promise<NodeExecResult> => {
  const prompt = render(str(input.node.config.prompt), input.context);
  const firstFrameTemplate = str(input.node.config.firstFrame);
  const firstFrameUrl = firstFrameTemplate ? render(firstFrameTemplate, input.context) : undefined;
  const result = await input.deps.video.generate(input.userId, {
    prompt,
    firstFrameUrl: firstFrameUrl || undefined,
    seconds: num(input.node.config.seconds, 5),
    size: str(input.node.config.size) || undefined,
    modelId: input.node.config.modelId as number | undefined
  });
  return { output: { url: result.url, taskId: result.taskId }, modelId: result.modelId };
};

// ---------- http：通用 API 调用（对接任意三方服务） ----------
const httpHandler = async (input: NodeExecInput): Promise<NodeExecResult> => {
  const url = render(str(input.node.config.url), input.context);
  if (!url) {
    throw new Error('HTTP 节点缺少 URL');
  }
  const method = str(input.node.config.method, 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  const rawHeaders = input.node.config.headers;
  if (rawHeaders && typeof rawHeaders === 'object') {
    for (const [key, value] of Object.entries(rawHeaders as Record<string, unknown>)) {
      headers[key] = render(String(value), input.context);
    }
  }
  const bodyTemplate = str(input.node.config.body);
  const body = bodyTemplate ? render(bodyTemplate, input.context) : undefined;
  if (body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const timeoutMs = Math.min(num(input.node.config.timeoutMs, 15000), 60000);
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined && method !== 'GET' && method !== 'HEAD' ? body : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // 非 JSON 响应原样返回
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return { output: { status: response.status, data } };
};

// ---------- delay：等待（调试限速/模拟人工确认） ----------
const delayHandler = async (input: NodeExecInput): Promise<NodeExecResult> => {
  const seconds = Math.min(Math.max(num(input.node.config.seconds, 1), 0), 300);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return { output: { waited: seconds } };
};

// ---------- end：按字段模板汇总产物，写入 run.outputs ----------
const endHandler = async (input: NodeExecInput): Promise<NodeExecResult> => {
  const fields = Array.isArray(input.node.config.fields) ? input.node.config.fields : [];
  const output: Record<string, unknown> = {};
  for (const raw of fields) {
    const field = raw as { key?: unknown; value?: unknown };
    const key = str(field.key);
    if (!key) {
      continue;
    }
    const template = field.value;
    // 对象/数组直接透传，字符串按模板渲染。
    if (typeof template === 'string') {
      output[key] = render(template, input.context);
    } else {
      output[key] = template ?? '';
    }
  }
  return { output };
};

export const NODE_HANDLERS: Record<string, (input: NodeExecInput) => Promise<NodeExecResult>> = {
  start: startHandler,
  llm: llmHandler,
  image: imageHandler,
  video: videoHandler,
  http: httpHandler,
  delay: delayHandler,
  end: endHandler
};
