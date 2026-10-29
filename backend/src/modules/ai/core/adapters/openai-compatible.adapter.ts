// OpenAI 兼容适配器：覆盖 DeepSeek/通义/Kimi/OpenAI/各类聚合网关（chat + images + probe）。
import { Injectable } from '@nestjs/common';
import {
  ChatMessagePayload,
  ChatRequestOptions,
  ImageRequestOptions,
  ImageResult,
  LlmAdapter,
  ProbeResult,
  ResolvedChannel,
  SpeechRequestOptions,
  SpeechResult
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
    // 带参考图 → images/edits（multipart，gpt-image 系图生图）；否则 images/generations（JSON）。
    if (options.referenceImages && options.referenceImages.length > 0) {
      return this.imageEdits(options, channel);
    }
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
      const detail = await response.text().catch(() => '');
      throw new Error(`生图上游响应异常: ${response.status}${detail.slice(0, 120)}`);
    }
    return this.parseImagesResponse(await response.json());
  }

  /** 图生图：参考图以 multipart 文件上传（OpenAI images/edits 协议，image[] 可多张）。 */
  private async imageEdits(options: ImageRequestOptions, channel: ResolvedChannel): Promise<ImageResult[]> {
    const form = new FormData();
    form.append('model', channel.upstreamModel);
    form.append('prompt', options.prompt);
    form.append('n', String(options.count ?? 1));
    if (options.size) {
      form.append('size', options.size);
    }
    options.referenceImages!.slice(0, 4).forEach((dataUrl, index) => {
      // match[0] 是完整匹配，group1=MIME，group2=base64 载荷
      const matched = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!matched) {
        throw new Error(`参考图 ${index + 1} 不是合法的 data URL`);
      }
      const mimePart = matched[1];
      const bytes = Buffer.from(matched[2], 'base64');
      form.append('image[]', new Blob([bytes], { type: mimePart ?? 'image/png' }), `reference-${index}.png`);
    });
    const response = await fetch(`${channel.baseUrl}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${channel.apiKeyPlain}` },
      body: form,
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`图生图上游响应异常: ${response.status}${detail.slice(0, 120)}`);
    }
    return this.parseImagesResponse(await response.json());
  }

  /** gpt-image 系列只返回 b64_json（不支持 response_format=url），dall-e/聚合网关多返回 url；两者都兼容。
   *  MIME 按魔数判定（/9j/=JPEG，iVBOR=PNG），避免前缀与实际字节不符。 */
  private parseImagesResponse(data: { data?: Array<{ url?: string; b64_json?: string }> }): ImageResult[] {
    const urls = (data.data ?? [])
      .map((item) => {
        if (item.url) {
          return item.url;
        }
        if (!item.b64_json) {
          return undefined;
        }
        const mime = item.b64_json.startsWith('iVBOR')
          ? 'image/png'
          : item.b64_json.startsWith('/9j/')
            ? 'image/jpeg'
            : item.b64_json.startsWith('UklGR')
              ? 'image/webp'
              : 'image/png';
        return `data:${mime};base64,${item.b64_json}`;
      })
      .filter((url): url is string => Boolean(url));
    if (urls.length === 0) {
      throw new Error('生图结果为空');
    }
    return urls.map((url) => ({ url }));
  }

  /** 语音合成：OpenAI 兼容 /audio/speech，返回二进制音频转 base64。 */
  async speech(options: SpeechRequestOptions, channel: ResolvedChannel): Promise<SpeechResult> {
    const response = await fetch(`${channel.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKeyPlain}`
      },
      body: JSON.stringify({
        model: channel.upstreamModel,
        input: options.text,
        voice: options.voice ?? 'alloy',
        speed: options.speed,
        response_format: 'mp3'
      }),
      signal: AbortSignal.timeout(STREAM_TIMEOUT_MS)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`语音合成上游响应异常: ${response.status}${detail.slice(0, 120)}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error('语音合成结果为空');
    }
    return { audioBase64: buffer.toString('base64'), mime: 'audio/mpeg' };
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
