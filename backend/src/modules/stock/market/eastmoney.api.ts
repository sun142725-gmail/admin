// 东方财富接口解析：日 K 线（push2his）、板块列表/成分（push2 clist）、搜索（searchapi suggest）。
// 解析与网络分离，均可用 fixture 字符串做单元测试。
import { KlineItem } from '../indicators.util';

/** 内部 symbol → 东财 secid：sh→1.xxxxxx，sz→0.xxxxxx，板块 BK→90.BKxxxx。 */
export function secidFor(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.startsWith('BK')) {
    return `90.${trimmed}`;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('sh')) {
    return `1.${lower.slice(2)}`;
  }
  if (lower.startsWith('sz')) {
    return `0.${lower.slice(2)}`;
  }
  return lower;
}

export interface EastmoneyKlineResponse {
  data?: {
    code?: string;
    name?: string;
    klines?: string[];
  };
}

/** K 线 CSV 字段：日期,开,收,高,低,量(手),额(元),振幅,涨跌幅,涨跌额,换手率。 */
export function parseEastmoneyKline(payload: EastmoneyKlineResponse): { name: string; items: KlineItem[] } {
  const lines = payload?.data?.klines ?? [];
  const items: KlineItem[] = [];
  for (const line of lines) {
    const fields = line.split(',');
    if (fields.length < 7) {
      continue;
    }
    const open = Number(fields[1]);
    const close = Number(fields[2]);
    const high = Number(fields[3]);
    const low = Number(fields[4]);
    const volume = Number(fields[5]);
    const amount = Number(fields[6]);
    if (![open, close, high, low].every((v) => Number.isFinite(v) && v > 0)) {
      continue;
    }
    items.push({
      date: fields[0],
      open,
      close,
      high,
      low,
      volume: Number.isFinite(volume) ? volume : 0,
      amount: Number.isFinite(amount) ? amount : 0,
      amplitude: Number.isFinite(Number(fields[7])) ? Number(fields[7]) : undefined,
      pct: Number.isFinite(Number(fields[8])) ? Number(fields[8]) : undefined,
      turnover: Number.isFinite(Number(fields[10])) ? Number(fields[10]) : undefined
    });
  }
  return { name: payload?.data?.name ?? '', items };
}

/** 东财 K 线周期码：101 日 / 102 周 / 103 月（原生聚合，口径对齐行情软件）。 */
export type EastmoneyKlt = 101 | 102 | 103;

export function buildEastmoneyKlineUrl(symbol: string, limit = 250, klt: EastmoneyKlt = 101): string {
  return (
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secidFor(symbol)}` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
    `&klt=${klt}&fqt=1&end=20500101&lmt=${limit}`
  );
}

export interface SectorItem {
  code: string;
  name: string;
  pct: number | null;
  upCount?: number;
  downCount?: number;
  leaderName?: string;
  leaderCode?: string;
  leaderPct?: number | null;
  /** 数据源标识：eastmoney（BKxxxx）/ sina（new_xxx）。 */
  source?: 'eastmoney' | 'sina';
}

interface EastmoneyClistRow {
  f2?: number | string;
  f3?: number | string;
  f6?: number | string;
  f5?: number | string;
  f12?: string;
  f13?: number;
  f14?: string;
  f20?: number | string;
  f104?: number;
  f105?: number;
  f128?: string;
  f140?: string;
  f136?: number | string;
}

export interface EastmoneyClistResponse {
  data?: { total?: number; diff?: EastmoneyClistRow[] };
}

const rowNum = (v: number | string | undefined): number | null => {
  if (v == null || v === '-') {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 板块列表：fs=m:90+t:2 行业 / t:3 概念；按涨跌幅（f3）排序由 po 参数决定。 */
export function parseEastmoneySectors(payload: EastmoneyClistResponse): { total: number; items: SectorItem[] } {
  const rows = payload?.data?.diff ?? [];
  const items = rows
    .map((row) => ({
      code: row.f12 ?? '',
      name: row.f14 ?? '',
      pct: rowNum(row.f3),
      upCount: row.f104,
      downCount: row.f105,
      leaderName: row.f128,
      leaderCode: row.f140,
      leaderPct: rowNum(row.f136)
    }))
    .filter((item) => item.code && item.name);
  return { total: payload?.data?.total ?? items.length, items };
}

export function buildEastmoneySectorsUrl(type: 'industry' | 'concept', pageSize = 100, desc = true): string {
  const t = type === 'industry' ? 't:2' : 't:3';
  return (
    `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=${desc ? 1 : 0}&np=1&fltt=2&invt=2` +
    `&fid=f3&fs=m:90+${t}+f:!50&fields=f2,f3,f12,f14,f104,f105,f128,f140,f136`
  );
}

/** 板块成分股（按涨跌幅排序）。 */
export function buildEastmoneyConstituentsUrl(bkCode: string, pageSize = 10): string {
  return (
    `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2` +
    `&fid=f3&fs=b:${bkCode}+f:!50&fields=f2,f3,f12,f14`
  );
}

// ---------- 市场板块股票列表（选股池数据源） ----------

/** 市场板块 → 东财 fs 过滤串。北交所（m:0+t:81）K 线源不支持，不纳入。 */
export type EastmoneyBoard = 'main' | 'chinext' | 'star';

export const EASTMONEY_BOARD_FS: Record<EastmoneyBoard, string> = {
  // 沪深主板：上证 60xxxx + 深证 000xxx
  main: 'm:1+t:2,m:0+t:6',
  // 创业板：300xxx / 301xxx
  chinext: 'm:0+t:80',
  // 科创板：688xxx
  star: 'm:1+t:23'
};

export interface StockListItem {
  /** 归一化代码（sh600519 / sz300750）。 */
  symbol: string;
  name: string;
  /** 总市值（元）；停牌等为 null。 */
  marketCap: number | null;
  /** 成交额（元）；停牌等为 null。 */
  amount: number | null;
  /** 成交量（手）；停牌等为 null。 */
  volume: number | null;
}

/** 股票列表排序字段：f20 总市值 / f6 成交额 / f5 成交量。 */
export type EastmoneySortField = 'f20' | 'f6' | 'f5';

/** 股票列表：按指定字段从大到小分页拉取（板块候选池数据源）。 */
export function buildEastmoneyStockListUrl(
  fs: string,
  page: number,
  pageSize = 100,
  sortField: EastmoneySortField = 'f20'
): string {
  return (
    `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2` +
    `&fid=${sortField}&fs=${fs}+f:!50&fields=f12,f13,f14,f5,f6,f20`
  );
}

export function parseEastmoneyStockList(payload: EastmoneyClistResponse): { total: number; items: StockListItem[] } {
  const rows = payload?.data?.diff ?? [];
  const items = rows
    .map((row) => {
      const code = row.f12 ?? '';
      if (!/^\d{6}$/.test(code) || row.f13 !== 0 && row.f13 !== 1) {
        return null;
      }
      return {
        symbol: `${row.f13 === 1 ? 'sh' : 'sz'}${code}`,
        name: row.f14 ?? '',
        marketCap: rowNum(row.f20),
        amount: rowNum(row.f6),
        volume: rowNum(row.f5)
      };
    })
    .filter((item): item is StockListItem => item !== null);
  return { total: payload?.data?.total ?? items.length, items };
}

// 全市场 A 股过滤串：沪深主板 + 创业板 + 科创板（北交所 K 线源不支持，不纳入）。
export const EASTMONEY_ALL_A_FS = 'm:1+t:2,m:0+t:6,m:0+t:80,m:1+t:23';

/** 全市场成交额排行（f6 从大到小）：每日收盘扫描的候选池数据源。 */
export function buildEastmoneyAmountRankUrl(page: number, pageSize = 100): string {
  return (
    `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2` +
    `&fid=f6&fs=${EASTMONEY_ALL_A_FS}+f:!50&fields=f12,f13,f14,f5,f6,f20`
  );
}

// ---------- 新浪排行列表（东财被限流时的容灾源） ----------

/** 板块 → 新浪行情中心节点（主板需按 60/00 前缀过滤，故沪/深分开拉）。 */
export const SINA_BOARD_NODES: Record<EastmoneyBoard, string[]> = {
  main: ['sh_a', 'sz_a'],
  chinext: ['cyb'],
  star: ['kcb']
};

export type SinaSortField = 'amount' | 'volume' | 'mktcap';

/** 新浪 A 股排行（按 sort 字段从大到小）。 */
export function buildSinaRankUrl(node: string, page: number, num = 100, sort: SinaSortField = 'amount'): string {
  return (
    `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData` +
    `?page=${page}&num=${num}&sort=${sort}&asc=0&node=${node}&symbol=&_s_r_a=page`
  );
}

export interface SinaRankRow {
  symbol?: string;
  code?: string;
  name?: string;
  /** 成交额（元）。 */
  amount?: number | string;
  /** 成交量（股）。 */
  volume?: number | string;
  /** 总市值（万元）。 */
  mktcap?: number | string;
}

export function parseSinaRankList(raw: string): StockListItem[] {
  let rows: SinaRankRow[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      rows = parsed as SinaRankRow[];
    }
  } catch {
    return [];
  }
  return rows
    .map((row) => {
      const symbol = (row.symbol ?? '').toLowerCase();
      if (!/^(sh|sz)\d{6}$/.test(symbol)) {
        return null;
      }
      const toNumber = (v: number | string | undefined): number | null => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      return {
        symbol,
        name: row.name ?? '',
        // 新浪 mktcap 单位万元 → 元；volume 单位股 → 手（与东财口径一致）
        marketCap: row.mktcap != null ? toNumber(row.mktcap) === null ? null : toNumber(row.mktcap)! * 10000 : null,
        amount: toNumber(row.amount),
        volume: row.volume != null ? toNumber(row.volume) === null ? null : Math.round(toNumber(row.volume)! / 100) : null
      };
    })
    .filter((item): item is StockListItem => item !== null);
}

export interface SearchItem {
  symbol: string;
  code: string;
  name: string;
  type: 'stock' | 'index';
}

interface EastmoneySuggestEntry {
  Code?: string;
  Name?: string;
  MktNum?: string;
  MarketType?: string;
  Classify?: string;
  SecurityTypeName?: string;
}

export interface EastmoneySuggestResponse {
  QuotationCodeTable?: { Data?: EastmoneySuggestEntry[] };
}

/** 搜索联想：只保留 A 股与沪深指数（Classify=AStock / 名称含"指数"），拼出内部 symbol。 */
export function parseEastmoneySuggest(payload: EastmoneySuggestResponse): SearchItem[] {
  const rows = payload?.QuotationCodeTable?.Data ?? [];
  const items: SearchItem[] = [];
  for (const row of rows) {
    const code = row.Code ?? '';
    const name = row.Name ?? '';
    if (!/^\d{6}$/.test(code)) {
      continue;
    }
    const classify = row.Classify ?? '';
    const isStock = classify === 'AStock';
    const isIndex = classify === 'Index' || classify === 'ZS' || (!isStock && name.includes('指数'));
    if (!isStock && !isIndex) {
      continue;
    }
    const market = row.MktNum === '1' ? 'sh' : row.MktNum === '0' ? 'sz' : code.startsWith('6') ? 'sh' : 'sz';
    items.push({
      symbol: `${market}${code}`,
      code,
      name,
      type: isIndex ? 'index' : 'stock'
    });
  }
  return items;
}

export function buildEastmoneySuggestUrl(keyword: string, count = 8): string {
  return (
    'https://searchapi.eastmoney.com/api/suggest/get' +
    `?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=${count}`
  );
}
