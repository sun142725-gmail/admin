// 联网搜索执行器（可插拔，无 key 时返回 null 由上层降级）：
// 博查（国内直连）> Tavily（海外）。调用方拿到统一结构 {title, snippet, url, date?}。
import { Injectable, Logger } from '@nestjs/common';

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  date?: string;
}

export interface WebSearchProvider {
  name: string;
  search(query: string, limit: number): Promise<WebSearchResult[]>;
}

class BochaProvider implements WebSearchProvider {
  name = 'bocha';
  constructor(private readonly apiKey: string) {}
  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    const res = await fetch('https://api.bochaai.com/v1/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, summary: true, count: limit, freshness: 'oneMonth' }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      throw new Error(`博查返回 ${res.status}`);
    }
    const data = (await res.json()) as {
      data?: { webPages?: { value?: Array<{ name?: string; summary?: string; snippet?: string; url?: string; dateLastCrawled?: string }> } };
    };
    return (data.data?.webPages?.value ?? [])
      .map((item) => ({
        title: item.name ?? '',
        snippet: (item.summary ?? item.snippet ?? '').slice(0, 200),
        url: item.url ?? '',
        date: item.dateLastCrawled?.slice(0, 10)
      }))
      .filter((item) => item.title);
  }
}

class TavilyProvider implements WebSearchProvider {
  name = 'tavily';
  constructor(private readonly apiKey: string) {}
  async search(query: string, limit: number): Promise<WebSearchResult[]> {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, query, max_results: limit, search_depth: 'basic' }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      throw new Error(`Tavily 返回 ${res.status}`);
    }
    const data = (await res.json()) as { results?: Array<{ title?: string; content?: string; url?: string; published_date?: string }> };
    return (data.results ?? [])
      .map((item) => ({
        title: item.title ?? '',
        snippet: (item.content ?? '').slice(0, 200),
        url: item.url ?? '',
        date: item.published_date?.slice(0, 10)
      }))
      .filter((item) => item.title);
  }
}

@Injectable()
export class SearchExecutorService {
  private readonly logger = new Logger(SearchExecutorService.name);

  /** 是否有可用搜索执行器（决定调研段走真搜索还是知识注入）。 */
  get available(): boolean {
    return this.provider() !== null;
  }

  get providerName(): string {
    return this.provider()?.name ?? 'none';
  }

  private provider(): WebSearchProvider | null {
    if (process.env.BOCHA_API_KEY) {
      return new BochaProvider(process.env.BOCHA_API_KEY);
    }
    if (process.env.TAVILY_API_KEY) {
      return new TavilyProvider(process.env.TAVILY_API_KEY);
    }
    return null;
  }

  async search(query: string, limit = 5): Promise<WebSearchResult[] | null> {
    const provider = this.provider();
    if (!provider) {
      return null;
    }
    try {
      return await provider.search(query, limit);
    } catch (error) {
      this.logger.warn(`搜索执行器 ${provider.name} 失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return null;
    }
  }
}
