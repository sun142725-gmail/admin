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

export function buildEastmoneyKlineUrl(symbol: string, limit = 250): string {
  return (
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secidFor(symbol)}` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
    `&klt=101&fqt=1&end=20500101&lmt=${limit}`
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
  f12?: string;
  f14?: string;
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
