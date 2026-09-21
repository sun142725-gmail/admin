// OpenAI 兼容适配器：覆盖 DeepSeek/通义/Kimi/OpenAI/各类聚合网关（chat + images + probe）。
import { Injectable } from '@nestjs/common';
import {
  ChatMessagePayload,
  ChatRequestOptions,
  ImageRequestOptions,
  ImageResult,
  LlmAdapter,
  ProbeResult,
  ResolvedChannel
} from '../llm-adapter.interface';

const STREAM_TIMEOUT_MS = 120000;

@Injectable()
export class OpenAiCompatibleAdapter implements LlmAdapter {
  readonly type = 'openai-compatible';

  async *chatStream(
    messages: ChatMessagePayload[],
    options: ChatRequestOptions,
    channel: ResolvedChannel
  ): AsyncGenerator<string> {
    const response = await fetch(`${channel.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKeyPlain}`
      },
      body: JSON.stringify({
        model: channel.upstreamModel,
        messages,
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxTokens,
        stream: true
      }),
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`上游响应异常: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('上游响应缺少流内容');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
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
            // 忽略无法解析的分片。
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async images(options: ImageRequestOptions, channel: ResolvedChannel): Promise<ImageResult[]> {
    const response = await fetch(`${channel.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKeyPlain}`
      },
      body: JSON.stringify({
        model: channel.upstreamModel,
        prompt: options.prompt,
        n: options.count ?? 1,
        size: options.size ?? '1024x1024'
      }),
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`生图上游响应异常: ${response.status}`);
    }
    const data = (await response.json()) as { data?: Array<{ url?: string }> };
    const urls = (data.data ?? []).map((item) => item.url).filter((url): url is string => Boolean(url));
    if (urls.length === 0) {
      throw new Error('生图结果为空');
    }
    return urls.map((url) => ({ url }));
  }

  async probe(channel: ResolvedChannel): Promise<ProbeResult> {
    try {
      const response = await fetch(`${channel.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${channel.apiKeyPlain}` },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        return { ok: false, message: `上游响应异常: ${response.status}` };
      }
      const data = (await response.json()) as { data?: Array<{ id?: string }> };
      const models = (data.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
      return { ok: true, models };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '连接失败' };
    }
  }
}
