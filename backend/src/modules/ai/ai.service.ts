// AI 服务用于调用 DeepSeek/OpenAI 生成解卦文本。
import { Injectable, Logger } from '@nestjs/common';

interface LinePayload {
  signStr: string;
  symbol: string;
  name: string;
  sum?: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async interpret(lines: LinePayload[], topic?: string) {
    const providers = this.getProviders();
    if (providers.length === 0) {
      return this.fallbackInterpretation(lines, topic);
    }

    for (const provider of providers) {
      try {
        const content = await this.request(provider, lines, topic);
        if (content) {
          return content;
        }
      } catch (error) {
        this.logger.warn(`AI 调用失败: ${provider.name}`);
      }
    }

    return this.fallbackInterpretation(lines, topic);
  }

  private getProviders() {
    const providers: Array<{ name: string; baseUrl: string; apiKey: string; model: string }> = [];
    if (process.env.DEEPSEEK_API_KEY) {
      providers.push({
        name: 'deepseek',
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
      });
    }
    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: 'openai',
        baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
      });
    }
    return providers;
  }

  private async request(
    provider: { name: string; baseUrl: string; apiKey: string; model: string },
    lines: LinePayload[],
    topic?: string
  ) {
    const prompt = this.buildPrompt(lines, topic);
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: 'system',
            content: '你是专业的易经六爻解读助手，输出简洁中文解读。'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI 请求失败: ${response.status} ${errorText}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim();
  }

  private buildPrompt(lines: LinePayload[], topic?: string) {
    const linesText = lines
      .map((line, index) => `第${index + 1}爻：${line.name} ${line.symbol} ${line.signStr}`)
      .join('\n');
    return `占卜主题：${topic ?? '未提供'}\n${linesText}\n请给出简短解卦建议（2-4 句）。`;
  }

  private fallbackInterpretation(lines: LinePayload[], topic?: string) {
    const counts: Record<string, number> = { 老阳: 0, 老阴: 0, 少阳: 0, 少阴: 0 };
    lines.forEach((line) => {
      if (counts[line.name] !== undefined) {
        counts[line.name] += 1;
      }
    });
    const dominant = Object.keys(counts).reduce((a, b) =>
      counts[a] >= counts[b] ? a : b
    );
    return `占卜主题：${topic ?? '未提供'}。六爻以“${dominant}”为主，建议保持平衡心态，顺势而为。`;
  }
}
