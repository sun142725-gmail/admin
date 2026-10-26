// 行情数据服务：聚合免费公开行情（腾讯实时快照 / 东财 K 线与板块），内存 TTL 缓存 + 双源互备。
// 仅供学习研究，接口为公开非官方通道，失败时抛出明确错误由上层降级提示。
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { KlineItem } from '../indicators.util';
import {
  QuoteSnapshot,
  SuggestItem,
  TencentKlineResponse,
  buildSinaKlineUrl,
  buildSinaQuoteUrl,
  buildTencentKlineUrl,
  buildTencentQuoteUrl,
  buildTencentSuggestUrl,
  normalizeSymbol,
  parseSinaKline,
  parseSinaQuotes,
  parseTencentKline,
  parseTencentQuotes,
  parseTencentSuggest
} from './tencent-quote.api';
import {
  EastmoneyKlineResponse,
  SectorItem,
  SearchItem,
  buildEastmoneyConstituentsUrl,
  buildEastmoneyKlineUrl,
  buildEastmoneySectorsUrl,
  parseEastmoneyKline,
  parseEastmoneySectors
} from './eastmoney.api';
import {
  buildSinaNodeUrl,
  buildSinaSectorListUrl,
  isEastmoneySectorCode,
  isSinaSectorCode,
  parseSinaConstituents,
  parseSinaSectorList
} from './sina-sector.api';
import {
  AnnouncementItem,
  CninfoAnnouncementRow,
  CninfoOrgRow,
  buildCninfoAnnouncementUrl,
  buildCninfoOrgUrl,
  cninfoAnnouncementBody,
  cninfoOrgBody,
  parseCninfoAnnouncements,
  parseCninfoOrg
} from './cninfo.api';
import { ThsFinancials, buildThsF10Url, parseThsFinancials } from './ths-f10.api';

const FETCH_TIMEOUT_MS = 8000;
const QUOTE_TTL_MS = 30 * 1000;
const KLINE_TTL_MS = 10 * 60 * 1000;
const SECTOR_TTL_MS = 5 * 60 * 1000;
const OVERVIEW_TTL_MS = 60 * 1000;

export interface MarketBreadth {
  up: number;
  down: number;
  approximate: boolean;
}

export interface MarketOverview {
  indexes: QuoteSnapshot[];
  breadth: MarketBreadth | null;
  topSectors: SectorItem[];
  bottomSectors: SectorItem[];
}

interface CacheEntry<T> {
  at: number;
  data: T;
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`行情接口返回 ${response.status}`);
  }
  return response.text();
}

// 腾讯/新浪返回 GBK 编码，需按 GBK 解码（Node 20 内置全量 ICU）。
async function fetchGbk(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`行情接口返回 ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new TextDecoder('gbk').decode(buffer);
}

async function fetchJson<T>(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<T> {
  let text: string;
  if (init?.method) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`接口返回 ${response.status}`);
    }
    text = await response.text();
  } else {
    text = await fetchText(url);
  }
  // 部分接口（如东财 suggest）会返回 jQuery...( {...} ) 的 JSONP 包装，剥离后解析。
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start =
    firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;
  const endBrace = text.lastIndexOf('}');
  const endBracket = text.lastIndexOf(']');
  const end = endBrace > endBracket ? endBrace : endBracket;
  if (start >= 0 && end > start && (start > 0 || end < text.length - 1)) {
    text = text.slice(start, end + 1);
  }
  return JSON.parse(text) as T;
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  // 缓存条目上限：过期条目只惰性删除，不设上限时用户查过的每只陌生股票的 K 线数组都会常驻内存
  private static readonly MAX_CACHE_KEYS = 200;
  private readonly quoteCache = new Map<string, CacheEntry<QuoteSnapshot>>();
  private readonly klineCache = new Map<string, CacheEntry<{ name: string; items: KlineItem[] }>>();
  private readonly sectorCache = new Map<string, CacheEntry<{ total: number; items: SectorItem[] }>>();
  private readonly overviewCache = new Map<string, CacheEntry<MarketOverview>>();
  private readonly announcementCache = new Map<string, CacheEntry<AnnouncementItem[]>>();
  private readonly financialsCache = new Map<string, CacheEntry<ThsFinancials | null>>();

  // 超限时淘汰最旧的 key（Map 迭代序即插入序），并顺带清理已过期条目
  private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>, ttl: number) {
    if (cache.size <= MarketDataService.MAX_CACHE_KEYS) {
      return;
    }
    for (const [key, entry] of cache) {
      if (Date.now() - entry.at > ttl) {
        cache.delete(key);
      }
    }
    for (const key of cache.keys()) {
      if (cache.size <= MarketDataService.MAX_CACHE_KEYS) {
        break;
      }
      cache.delete(key);
    }
  }

  private getCache<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.at > ttl) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  /** 实时快照：腾讯主源（批量），新浪备用（需 Referer）。 */
  async quotes(rawSymbols: string[]): Promise<QuoteSnapshot[]> {
    const symbols = [...new Set(rawSymbols.map(normalizeSymbol).filter((s) => /^(sh|sz)\d{6}$/.test(s)))];
    if (symbols.length === 0) {
      return [];
    }
    const now = Date.now();
    const result: QuoteSnapshot[] = [];
    const missing: string[] = [];
    for (const symbol of symbols) {
      const cached = this.quoteCache.get(symbol);
      if (cached && now - cached.at <= QUOTE_TTL_MS) {
        result.push(cached.data);
      } else {
        missing.push(symbol);
      }
    }
    if (missing.length > 0) {
      const fetched = await this.fetchQuotesWithFallback(missing);
      for (const snapshot of fetched) {
        this.quoteCache.set(snapshot.symbol, { at: now, data: snapshot });
        this.evictIfNeeded(this.quoteCache, QUOTE_TTL_MS);
      }
      const fetchedMap = new Map(fetched.map((s) => [s.symbol, s]));
      result.push(...missing.map((s) => fetchedMap.get(s)).filter((s): s is QuoteSnapshot => !!s));
      if (fetched.length === 0) {
        throw new ServiceUnavailableException('行情快照暂时不可用（腾讯/新浪均无响应），请稍后重试');
      }
    }
    return result;
  }

  private async fetchQuotesWithFallback(symbols: string[]): Promise<QuoteSnapshot[]> {
    try {
      const raw = await fetchGbk(buildTencentQuoteUrl(symbols));
      const parsed = parseTencentQuotes(raw);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      this.logger.warn(`腾讯行情失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
    try {
      const raw = await fetchGbk(buildSinaQuoteUrl(symbols), { Referer: 'https://finance.sina.com.cn' });
      return parseSinaQuotes(raw);
    } catch (error) {
      this.logger.warn(`新浪行情失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return [];
    }
  }

  async quote(symbol: string): Promise<QuoteSnapshot> {
    const [snapshot] = await this.quotes([symbol]);
    if (!snapshot) {
      throw new ServiceUnavailableException(`未查询到 ${symbol} 的行情快照`);
    }
    return snapshot;
  }

  /** 日 K 线（前复权）：东财主源（含板块 BK）→ 腾讯 → 新浪三级容灾，个股/指数 sh/sz。
   *  新浪体系板块（new_xxx）无公开 K 线源，抛出特定错误由会议简报层降级为成分股聚合。 */
  async kline(symbol: string, limit = 250): Promise<{ name: string; items: KlineItem[] }> {
    const key = `${symbol}:${limit}`;
    const cached = this.getCache(this.klineCache, key, KLINE_TTL_MS);
    if (cached) {
      return cached;
    }
    if (isSinaSectorCode(symbol)) {
      throw new ServiceUnavailableException('新浪板块暂无 K 线数据源');
    }
    let parsed: { name: string; items: KlineItem[] } | null = null;

    try {
      const payload = await fetchJson<EastmoneyKlineResponse>(buildEastmoneyKlineUrl(symbol, limit));
      parsed = parseEastmoneyKline(payload);
    } catch (error) {
      this.logger.warn(`东财 K 线失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
    if (!parsed || parsed.items.length === 0) {
      // 板块 K 线只有东财支持，直接判失败。
      if (isEastmoneySectorCode(symbol)) {
        throw new ServiceUnavailableException('板块 K 线数据暂时不可用（东财接口无响应），请稍后重试');
      }
      parsed = await this.fetchKlineFromTencent(symbol, limit).catch(() => null);
    }
    if (!parsed || parsed.items.length === 0) {
      parsed = await this.fetchKlineFromSina(symbol, limit).catch(() => null);
    }
    if (!parsed || parsed.items.length === 0) {
      throw new ServiceUnavailableException(`未查询到 ${symbol} 的 K 线数据（已尝试东财/腾讯/新浪），请稍后重试`);
    }
    this.klineCache.set(key, { at: Date.now(), data: parsed });
    this.evictIfNeeded(this.klineCache, KLINE_TTL_MS);
    return parsed;
  }

  private async fetchKlineFromTencent(symbol: string, limit: number) {
    const payload = await fetchJson<TencentKlineResponse>(buildTencentKlineUrl(symbol, limit + 20));
    const parsed = parseTencentKline(payload, limit);
    if (parsed.items.length === 0) {
      throw new Error('腾讯 K 线为空');
    }
    return parsed;
  }

  private async fetchKlineFromSina(symbol: string, limit: number) {
    const raw = await fetchText(buildSinaKlineUrl(symbol, limit + 20));
    const parsed = parseSinaKline(raw, limit);
    if (parsed.items.length === 0) {
      throw new Error('新浪 K 线为空');
    }
    return parsed;
  }

  /** 行业/概念板块列表（含涨跌家数与领涨股）。 */
  async sectors(type: 'industry' | 'concept' = 'industry'): Promise<{ total: number; items: SectorItem[] }> {
    const cached = this.getCache(this.sectorCache, type, SECTOR_TTL_MS);
    if (cached) {
      return cached;
    }
    const [desc, asc] = await Promise.all([
      fetchJson(buildEastmoneySectorsUrl(type, 100, true)).catch(() => null),
      fetchJson(buildEastmoneySectorsUrl(type, 5, false)).catch(() => null)
    ]);
    const parsed = desc ? parseEastmoneySectors(desc) : { total: 0, items: [] };
    if (parsed.items.length === 0) {
      throw new ServiceUnavailableException('板块数据暂时不可用，请稍后重试');
    }
    // 末位板块补充（跌幅榜）：desc 前 100 + asc 前 5 去重。
    if (asc) {
      const known = new Set(parsed.items.map((item) => item.code));
      for (const item of parseEastmoneySectors(asc).items) {
        if (!known.has(item.code)) {
          parsed.items.push(item);
        }
      }
    }
    this.sectorCache.set(type, { at: Date.now(), data: parsed });
    this.evictIfNeeded(this.sectorCache, SECTOR_TTL_MS);
    return parsed;
  }

  async sectorInfo(sectorCode: string): Promise<SectorItem | null> {
    const code = sectorCode.trim();
    if (isSinaSectorCode(code)) {
      return this.sinaSectorAggregate(code);
    }
    const upper = code.toUpperCase();
    for (const type of ['industry', 'concept'] as const) {
      const list = await this.sectors(type).catch(() => null);
      const found = list?.items.find((item) => item.code === upper);
      if (found) {
        return found;
      }
    }
    // 东财列表不可用时也判空：由上层给出"板块不存在或数据源不可用"提示。
    return null;
  }

  /** 新浪板块聚合：成分股行情合成板块涨幅/涨跌家数/领涨股。 */
  private async sinaSectorAggregate(node: string): Promise<SectorItem | null> {
    const list = await fetchGbk(buildSinaSectorListUrl())
      .then((raw) => parseSinaSectorList(raw))
      .catch(() => [] as Array<{ code: string; name: string }>);
    const meta = list.find((item) => item.code === node);
    if (!meta) {
      return null;
    }
    const constituents = await this.sinaConstituents(node, 100).catch(() => []);
    if (constituents.length === 0) {
      return { code: node, name: meta.name, pct: null, source: 'sina' };
    }
    const up = constituents.filter((c) => c.changePct > 0).length;
    const down = constituents.filter((c) => c.changePct < 0).length;
    const avgPct = constituents.reduce((sum, c) => sum + c.changePct, 0) / constituents.length;
    const leader = constituents[0];
    return {
      code: node,
      name: meta.name,
      pct: Math.round(avgPct * 100) / 100,
      upCount: up,
      downCount: down,
      leaderName: leader.name,
      leaderCode: leader.symbol,
      leaderPct: leader.changePct,
      source: 'sina'
    };
  }

  private async sinaConstituents(node: string, pageSize = 100) {
    const payload = await fetchJson<Parameters<typeof parseSinaConstituents>[0]>(buildSinaNodeUrl(node, pageSize));
    return parseSinaConstituents(payload);
  }

  /** 板块成分股（涨幅前 N）：东财 BK 代码 / 新浪 new_ 代码双体系。 */
  async sectorConstituents(sectorCode: string, limit = 10): Promise<Array<{ code: string; name: string; pct: number | null }>> {
    const code = sectorCode.trim();
    if (isSinaSectorCode(code)) {
      const rows = await this.sinaConstituents(code, 100).catch(() => []);
      return rows.slice(0, limit).map((row) => ({ code: row.symbol, name: row.name, pct: row.changePct }));
    }
    const upper = code.toUpperCase();
    if (!isEastmoneySectorCode(upper)) {
      return [];
    }
    const payload = await fetchJson<{
      data?: { diff?: Array<{ f12?: string; f14?: string; f3?: number | string }> };
    }>(buildEastmoneyConstituentsUrl(upper, limit)).catch(() => null);
    const rows = payload?.data?.diff ?? [];
    return rows
      .map((row) => ({
        code: row.f12 ?? '',
        name: row.f14 ?? '',
        pct: row.f3 == null || row.f3 === '-' ? null : Number(row.f3)
      }))
      .filter((item) => item.code && item.name);
  }

  /** 搜索联想：证券走腾讯 smartbox（东财 suggest 已失效，降为备用校验）；板块东财优先、新浪兜底。 */
  async search(keyword: string): Promise<{ stocks: SearchItem[]; sectors: SectorItem[] }> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return { stocks: [], sectors: [] };
    }
    const [tencentSuggest, eastSectors, sinaSectors] = await Promise.all([
      fetchGbk(buildTencentSuggestUrl(trimmed, 10))
        .then((raw) => parseTencentSuggest(raw))
        .catch(() => [] as SuggestItem[]),
      this.sectorSearchFromEastmoney(trimmed),
      this.sectorSearchFromSina(trimmed)
    ]);
    // 东财板块（有涨幅家数）优先，新浪兜底补齐。
    const seen = new Set<string>();
    const sectors: SectorItem[] = [];
    for (const item of [...eastSectors, ...sinaSectors]) {
      if (seen.has(item.name)) {
        continue;
      }
      seen.add(item.name);
      sectors.push(item);
      if (sectors.length >= 6) {
        break;
      }
    }
    return { stocks: tencentSuggest, sectors };
  }

  private async sectorSearchFromEastmoney(keyword: string): Promise<SectorItem[]> {
    const lists = await Promise.all([
      this.sectors('industry').catch(() => null),
      this.sectors('concept').catch(() => null)
    ]);
    return lists
      .flatMap((list) => list?.items ?? [])
      .filter(
        (item) => item.name.includes(keyword) || item.code.toUpperCase().includes(keyword.toUpperCase())
      )
      .slice(0, 6);
  }

  private async sectorSearchFromSina(keyword: string): Promise<SectorItem[]> {
    const list = await fetchGbk(buildSinaSectorListUrl())
      .then((raw) => parseSinaSectorList(raw))
      .catch(() => [] as Array<{ code: string; name: string }>);
    return list
      .filter((item) => item.name.includes(keyword) || item.code.toLowerCase().includes(keyword.toLowerCase()))
      .slice(0, 6)
      .map((item) => ({ code: item.code, name: item.name, pct: null, source: 'sina' as const }));
  }

  /** 个股公告（巨潮，官方权威源）：代码 → orgId → 最近 N 条公告。 */
  async announcements(symbol: string, limit = 8): Promise<AnnouncementItem[]> {
    const code = symbol.replace(/^(sh|sz)/, '');
    if (!/^\d{6}$/.test(code)) {
      return [];
    }
    const cached = this.getCache(this.announcementCache, code, SECTOR_TTL_MS);
    if (cached) {
      return cached;
    }
    const formHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const orgRows = await fetchJson<CninfoOrgRow[]>(buildCninfoOrgUrl(), {
      method: 'POST',
      headers: formHeaders,
      body: cninfoOrgBody(code)
    }).catch(() => [] as CninfoOrgRow[]);
    const org = parseCninfoOrg(orgRows, code);
    if (!org) {
      return [];
    }
    const payload = await fetchJson<{ announcements?: CninfoAnnouncementRow[] }>(buildCninfoAnnouncementUrl(), {
      method: 'POST',
      headers: formHeaders,
      body: cninfoAnnouncementBody(code, org.orgId, org.column, limit)
    }).catch(() => null);
    const items = parseCninfoAnnouncements(payload?.announcements ?? [], limit);
    if (items.length > 0) {
      this.announcementCache.set(code, { at: Date.now(), data: items });
      this.evictIfNeeded(this.announcementCache, SECTOR_TTL_MS);
    }
    return items;
  }

  /** 个股核心财务字段（同花顺 F10 主页，best-effort：改版/反爬时返回 null）。 */
  async financials(symbol: string): Promise<ThsFinancials | null> {
    const code = symbol.replace(/^(sh|sz)/, '');
    if (!/^\d{6}$/.test(code)) {
      return null;
    }
    const cached = this.getCache(this.financialsCache, code, 30 * 60 * 1000);
    if (cached !== null || this.financialsCache.has(code)) {
      return cached;
    }
    const html = await fetchGbk(buildThsF10Url(code), {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      Referer: 'https://basic.10jqka.com.cn/'
    }).catch(() => '');
    const parsed = parseThsFinancials(html);
    this.financialsCache.set(code, { at: Date.now(), data: parsed });
    this.evictIfNeeded(this.financialsCache, 30 * 60 * 1000);
    return parsed;
  }

  /** 大盘总览：三大指数 + 涨跌家数（行业板块加总，近似值）+ 领涨领跌板块。板块源失败时降级返回指数。 */
  async overview(): Promise<MarketOverview> {
    const cached = this.getCache(this.overviewCache, 'default', OVERVIEW_TTL_MS);
    if (cached) {
      return cached;
    }
    const [indexes, industry] = await Promise.all([
      this.quotes(['sh000001', 'sz399001', 'sz399006']).catch(() => [] as QuoteSnapshot[]),
      this.sectors('industry').catch((error: unknown) => {
        this.logger.warn(`板块数据降级: ${error instanceof Error ? error.message : '未知错误'}`);
        return null;
      })
    ]);
    if (indexes.length === 0) {
      throw new ServiceUnavailableException('大盘行情暂时不可用，请稍后重试');
    }
    const sectorItems = industry?.items ?? [];
    const up = sectorItems.reduce((sum, item) => sum + (item.upCount ?? 0), 0);
    const down = sectorItems.reduce((sum, item) => sum + (item.downCount ?? 0), 0);
    const sorted = [...sectorItems].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    const overview: MarketOverview = {
      indexes,
      breadth: sectorItems.length > 0 ? { up, down, approximate: true } : null,
      topSectors: sorted.slice(0, 5),
      bottomSectors: sorted.slice(-5).reverse()
    };
    this.overviewCache.set('default', { at: Date.now(), data: overview });
    this.evictIfNeeded(this.overviewCache, OVERVIEW_TTL_MS);
    return overview;
  }
}
