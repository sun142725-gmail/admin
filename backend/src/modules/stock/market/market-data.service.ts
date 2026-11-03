// 行情数据服务：聚合免费公开行情（腾讯实时快照 / 东财 K 线与板块），内存 TTL 缓存 + 双源互备。
// 仅供学习研究，接口为公开非官方通道，失败时抛出明确错误由上层降级提示。
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { KlineFreq, KlineItem, resampleKlines, resampleMinuteKlines } from '../indicators.util';
import { fetchGbk, fetchJson, fetchText } from './http.util';

/** K 线周期 → 东财 klt 码（101 日 / 102 周 / 103 月 / 60 分钟）。
 *  120min 无上游原生档：主源与容灾链统一先取 60min、本地两两重采样（口径一致）。 */
export const KLINE_FREQ_KLT: Record<KlineFreq, 60 | 101 | 102 | 103> = {
  day: 101,
  week: 102,
  month: 103,
  '60min': 60,
  '120min': 60
};
import {
  QuoteSnapshot,
  SuggestItem,
  TencentKlineResponse,
  TencentMinuteKlineResponse,
  buildSinaKlineUrl,
  buildSinaQuoteUrl,
  buildTencentKlineUrl,
  buildTencentMinuteKlineUrl,
  buildTencentQuoteUrl,
  buildTencentSuggestUrl,
  normalizeSymbol,
  parseSinaKline,
  parseSinaQuotes,
  parseTencentKline,
  parseTencentMinuteKline,
  parseTencentQuotes,
  parseTencentSuggest
} from './tencent-quote.api';
import {
  EastmoneyClistResponse,
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
  parseSinaSectorList,
  SinaSectorRaw
} from './sina-sector.api';
import {
  TencentSectorRankResponse,
  buildTencentSectorRankUrl,
  isTencentSectorCode,
  parseTencentSectorRank
} from './tencent-sector.api';
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

const QUOTE_TTL_MS = 30 * 1000;
const KLINE_TTL_MS = 10 * 60 * 1000;
const SECTOR_TTL_MS = 5 * 60 * 1000;
const OVERVIEW_TTL_MS = 60 * 1000;

export interface MarketBreadth {
  up: number;
  down: number;
  approximate: boolean;
}

/** K 线来源标记：日线三级容灾链（东财→腾讯→新浪）命中哪一源。
 *  仅 freq='day' 链路赋值（周/月/分钟重采样路径不标）；日线行情库源门禁据此放行/降级跳过，
 *  复权口径：东财前复权且成交额真实（唯一可入库源）；腾讯前复权但 amount 恒 0；新浪不复权。 */
export type KlineSource = 'eastmoney' | 'tencent' | 'sina';

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

/**
 * 跨源板块结果合并去重（纯函数）：按 name 先到先得，调用方按优先级顺序传参（东财→腾讯→新浪）。
 * 单源内部的去重（如东财 desc+asc 按 code）由各源自行处理，本函数只管跨源。
 */
export function mergeSectorResults(...lists: SectorItem[][]): { total: number; items: SectorItem[] } {
  const seen = new Set<string>();
  const items: SectorItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.name)) {
        continue;
      }
      seen.add(item.name);
      items.push(item);
    }
  }
  return { total: items.length, items };
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

  /** K 线（前复权）：东财主源（含板块 BK，原生支持日/周/月/60分）→ 腾讯 → 新浪三级容灾，个股/指数 sh/sz。
   *  新浪体系板块（new_xxx）无公开 K 线源、腾讯板块（qqt_xxx）仅列表可用，均抛特定错误由上层降级提示。
   *  周/月线主源为东财原生聚合；若东财不可用，回退为拉日 K 后本地重采样（口径近似行情软件）。
   *  60min 主源为东财原生分钟线，回退腾讯 mkline → 新浪 scale=60；120min 无上游原生，统一取 60min 后本地两两重采样。
   *  返回值带可选 source（仅 freq='day' 三级链路赋值）：日线行情库写库门禁只放行东财主源——
   *  腾讯/新浪降级命中时调用方跳过该标的（新浪不复权、双源 amount=0，错误口径写入是持久伤害）；
   *  source 为可选新字段，现有消费方不受影响。 */
  async kline(
    symbol: string,
    limit = 250,
    freq: KlineFreq = 'day'
  ): Promise<{ name: string; items: KlineItem[]; source?: KlineSource }> {
    const key = `${symbol}:${limit}:${freq}`;
    const cached = this.getCache(this.klineCache, key, KLINE_TTL_MS);
    if (cached) {
      return cached;
    }
    if (isSinaSectorCode(symbol)) {
      throw new ServiceUnavailableException('新浪板块暂无 K 线数据源');
    }
    if (isTencentSectorCode(symbol)) {
      throw new ServiceUnavailableException('腾讯板块暂无 K 线数据源');
    }
    // 主源请求：120min 先取 2×limit 根 60min（本地重采样后仍满足 limit 根）
    const eastLimit = freq === '120min' ? Math.min(800, limit * 2) : limit;
    let parsed: { name: string; items: KlineItem[]; source?: KlineSource } | null = null;

    try {
      const payload = await fetchJson<EastmoneyKlineResponse>(
        buildEastmoneyKlineUrl(symbol, eastLimit, KLINE_FREQ_KLT[freq])
      );
      const eastParsed = parseEastmoneyKline(payload);
      // 仅日线链路标记来源（周/月/分钟重采样路径口径混合，不标由门禁一视同仁拒绝）
      parsed = freq === 'day' ? { ...eastParsed, source: 'eastmoney' as const } : eastParsed;
      if (freq === '120min' && parsed.items.length > 0) {
        parsed = { name: parsed.name, items: resampleMinuteKlines(parsed.items, 2) };
      }
    } catch (error) {
      this.logger.warn(`东财 K 线失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
    if (!parsed || parsed.items.length === 0) {
      // 板块 K 线只有东财支持，直接判失败。
      if (isEastmoneySectorCode(symbol)) {
        throw new ServiceUnavailableException('板块 K 线数据暂时不可用（东财接口无响应），请稍后重试');
      }
      if (freq === 'day') {
        parsed = await this.fetchKlineFromTencent(symbol, limit).catch(() => null);
        if (!parsed || parsed.items.length === 0) {
          parsed = await this.fetchKlineFromSina(symbol, limit).catch(() => null);
        }
      } else if (freq === '60min') {
        // 60min 回退：腾讯 mkline → 新浪 scale=60（板块无分钟级兜底源，BK/new_/qqt_ 均已在上方拦截）
        parsed = await this.fetchKlineMinuteFromTencent(symbol, 'm60', limit).catch(() => null);
        if (!parsed || parsed.items.length === 0) {
          parsed = await this.fetchKlineMinuteFromSina(symbol, limit).catch(() => null);
        }
      } else if (freq === '120min') {
        // 120min 回退：拉足 60min 后本地两两重采样（递归带独立缓存 key，不会死循环）
        const minute = await this.kline(symbol, Math.min(800, limit * 2), '60min');
        parsed = { name: minute.name, items: resampleMinuteKlines(minute.items, 2) };
      } else {
        // 腾讯/新浪仅支持日 K：拉足日 K 后本地重采样为周/月
        const dailyLimit = freq === 'month' ? 800 : Math.min(800, limit * 5);
        const daily = await this.kline(symbol, dailyLimit, 'day');
        parsed = { name: daily.name, items: resampleKlines(daily.items, freq) };
      }
    }
    if (!parsed || parsed.items.length === 0) {
      throw new ServiceUnavailableException(`未查询到 ${symbol} 的 K 线数据（已尝试东财/腾讯/新浪），请稍后重试`);
    }
    this.klineCache.set(key, { at: Date.now(), data: parsed });
    this.evictIfNeeded(this.klineCache, KLINE_TTL_MS);
    return parsed;
  }

  // 日 K 二/三级兜底：带 source 标记（日线行情库门禁据此拒绝写库——腾讯 amount 恒 0、新浪不复权）
  private async fetchKlineFromTencent(symbol: string, limit: number): Promise<{ name: string; items: KlineItem[]; source: KlineSource }> {
    const payload = await fetchJson<TencentKlineResponse>(buildTencentKlineUrl(symbol, limit + 20));
    const parsed = parseTencentKline(payload, limit);
    if (parsed.items.length === 0) {
      throw new Error('腾讯 K 线为空');
    }
    return { ...parsed, source: 'tencent' };
  }

  private async fetchKlineFromSina(symbol: string, limit: number): Promise<{ name: string; items: KlineItem[]; source: KlineSource }> {
    const raw = await fetchText(buildSinaKlineUrl(symbol, limit + 20));
    const parsed = parseSinaKline(raw, limit);
    if (parsed.items.length === 0) {
      throw new Error('新浪 K 线为空');
    }
    return { ...parsed, source: 'sina' };
  }

  /** 腾讯分钟 K（mkline m60）：60min 回退二级。 */
  private async fetchKlineMinuteFromTencent(symbol: string, period: 'm60', limit: number) {
    const payload = await fetchJson<TencentMinuteKlineResponse>(
      buildTencentMinuteKlineUrl(symbol, period, limit + 20)
    );
    const parsed = parseTencentMinuteKline(payload, period, limit);
    if (parsed.items.length === 0) {
      throw new Error('腾讯分钟 K 线为空');
    }
    return parsed;
  }

  /** 新浪分钟 K（scale=60）：60min 回退三级。 */
  private async fetchKlineMinuteFromSina(symbol: string, limit: number) {
    const raw = await fetchText(buildSinaKlineUrl(symbol, limit + 20, 60));
    const parsed = parseSinaKline(raw, limit);
    if (parsed.items.length === 0) {
      throw new Error('新浪分钟 K 线为空');
    }
    return parsed;
  }

  /** 行业/概念板块列表：东财（desc 100 + asc 5）→ 腾讯 rank → 新浪列表三级容灾。
   *  东财主请求（desc）可用时维持既有行为直接返回；东财全挂/为空时腾讯补位（hy 行业 / gn 概念）；
   *  asc 跌幅榜仅在 desc 成功时作末位补充，desc 失败时 asc 数据不参与兜底（直接由腾讯补位，
   *  腾讯源自带涨跌幅反而更全）；再失败落新浪（仅代码+名称）。 */
  async sectors(type: 'industry' | 'concept' = 'industry'): Promise<{ total: number; items: SectorItem[] }> {
    const cached = this.getCache(this.sectorCache, type, SECTOR_TTL_MS);
    if (cached) {
      return cached;
    }
    const [desc, asc] = await Promise.all([
      fetchJson<EastmoneyClistResponse>(buildEastmoneySectorsUrl(type, 100, true)).catch(() => null),
      fetchJson<EastmoneyClistResponse>(buildEastmoneySectorsUrl(type, 5, false)).catch(() => null)
    ]);
    const eastParsed = desc
      ? parseEastmoneySectors(desc)
      : { total: 0, items: [] as SectorItem[] };
    // 末位板块补充（跌幅榜）：desc 前 100 + asc 前 5 按 code 去重（单源内部既有口径）。
    if (asc && eastParsed.items.length > 0) {
      const known = new Set(eastParsed.items.map((item) => item.code));
      for (const item of parseEastmoneySectors(asc).items) {
        if (!known.has(item.code)) {
          eastParsed.items.push(item);
        }
      }
    }
    // 东财主请求可用：维持既有行为，直接返回。
    if (desc && eastParsed.items.length > 0) {
      this.sectorCache.set(type, { at: Date.now(), data: eastParsed });
      this.evictIfNeeded(this.sectorCache, SECTOR_TTL_MS);
      return eastParsed;
    }
    // 东财失败或为空：腾讯 rank 兜底（type 与 board_type 一一映射）。
    const boardType = type === 'concept' ? 'gn' : 'hy';
    const tencentItems = await fetchJson<TencentSectorRankResponse>(buildTencentSectorRankUrl(boardType))
      .then((payload) => parseTencentSectorRank(payload))
      .catch(() => [] as SectorItem[]);
    const lists: SectorItem[][] = [];
    if (eastParsed.items.length > 0) {
      lists.push(eastParsed.items);
    }
    if (tencentItems.length > 0) {
      lists.push(tencentItems);
    }
    // 腾讯也失败：新浪列表兜底（无涨跌幅，仅代码+名称，同 search 兜底映射口径）。
    if (lists.length === 0) {
      const sinaItems = await fetchGbk(buildSinaSectorListUrl())
        .then((raw) => parseSinaSectorList(raw))
        .catch(() => [] as SinaSectorRaw[])
        .then((rows) => rows.map((item) => ({ code: item.code, name: item.name, pct: null, source: 'sina' as const })));
      if (sinaItems.length > 0) {
        lists.push(sinaItems);
      }
    }
    const merged = mergeSectorResults(...lists);
    if (merged.items.length === 0) {
      throw new ServiceUnavailableException('板块数据暂时不可用，请稍后重试');
    }
    // total 沿用东财口径需同时确认 items 非空：desc 成功但解析 0 条（上游畸形响应）时
    // eastParsed.total 是东财的数字、merged.items 已是腾讯/新浪数据，直接沿用会张冠李戴。
    const result = {
      total: eastParsed.total > 0 && eastParsed.items.length > 0 ? eastParsed.total : merged.items.length,
      items: merged.items
    };
    this.sectorCache.set(type, { at: Date.now(), data: result });
    this.evictIfNeeded(this.sectorCache, SECTOR_TTL_MS);
    return result;
  }

  async sectorInfo(sectorCode: string): Promise<SectorItem | null> {
    const code = sectorCode.trim();
    if (isSinaSectorCode(code)) {
      return this.sinaSectorAggregate(code);
    }
    const upper = code.toUpperCase();
    for (const type of ['industry', 'concept'] as const) {
      const list = await this.sectors(type).catch(() => null);
      // 列表项统一大写化后再比对：腾讯兜底 code 为小写/混合大小写（qqt_pt01801120 / qqt_pt02GN2174），
      // 严格相等会永远失配导致 qqt_ 板块详情恒空。
      const found = list?.items.find((item) => item.code.toUpperCase() === upper);
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
      // l=30 与函数默认值一致：上游实测加大 l 对行业词无效，但提高具体股票名场景召回余量
      // （实测记录见 tencent-quote.api.ts buildTencentSuggestUrl 注释）；解析端 slice(0,10) 收口。
      fetchGbk(buildTencentSuggestUrl(trimmed, 30))
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
