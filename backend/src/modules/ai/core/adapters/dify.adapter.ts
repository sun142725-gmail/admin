// Dify 适配器：把 Dify 应用的 chat-messages 流翻译为统一 chunk（P0 支持 chat/agent 型应用）。
import { Injectable } from '@nestjs/common';
import {
  ChatMessagePayload,
  ChatRequestOptions,
  LlmAdapter,
  ProbeResult,
  ResolvedChannel
} from '../llm-adapter.interface';

const STREAM_TIMEOUT_MS = 120000;

@Injectable()
export class DifyAdapter implements LlmAdapter {
  readonly type = 'dify';

  async *chatStream(
    messages: ChatMessagePayload[],
    _options: ChatRequestOptions,
    channel: ResolvedChannel
  ): AsyncGenerator<string> {
    // Dify 以 query 单轮输入；历史由 Dify 侧 conversation 维护，这里取最后一条用户消息。
    const userMessage = [...messages].reverse().find((item) => item.role === 'user');
    const systemPrompt = messages.find((item) => item.role === 'system')?.content ?? '';
    if (!userMessage) {
      throw new Error('缺少用户消息');
    }

    const response = await fetch(`${channel.baseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKeyPlain}`
      },
      body: JSON.stringify({
        inputs: systemPrompt ? { system_prompt: systemPrompt } : {},
        query: userMessage.content,
        response_mode: 'stream',
        user: `web-${channel.modelRowId ?? 'agent'}`
      }),
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`Dify 响应异常: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Dify 响应缺少流内容');
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
          try {
            const parsed = JSON.parse(line.slice(5).trim()) as { event?: string; answer?: string };
            if (parsed.event === 'message' && parsed.answer) {
              yield parsed.answer;
            }
            if (parsed.event === 'error') {
              throw new Error('Dify 应用返回错误');
            }
          } catch (error) {
            if (error instanceof Error && error.message === 'Dify 应用返回错误') {
              throw error;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async probe(channel: ResolvedChannel): Promise<ProbeResult> {
    try {
      const response = await fetch(`${channel.baseUrl}/info`, {
        headers: { Authorization: `Bearer ${channel.apiKeyPlain}` },
        signal: AbortSignal.timeout(10000)
      });
      return response.ok
        ? { ok: true }
        : { ok: false, message: `Dify 响应异常: ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '连接失败' };
    }
  }
}
