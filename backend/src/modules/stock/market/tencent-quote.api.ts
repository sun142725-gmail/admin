// 腾讯行情解析：qt.gtimg.cn 返回 GBK 文本，格式 v_sh600519="1~名称~代码~现价~..."（~ 分隔）。
import { KlineItem } from '../indicators.util';
// 字段布局以 2026-10 实测为准：1 名称 / 3 现价 / 4 昨收 / 5 今开 / 30 时间 / 31 涨跌 /
// 32 涨跌幅 / 33 最高 / 34 最低 / 36 量(手) / 37 额(万) / 38 换手 / 39 PE / 43 振幅 /
// 44 流通市值(亿) / 45 总市值(亿) / 46 PB。
export interface QuoteSnapshot {
  symbol: string;
  code: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（万元） */
  amountWan: number;
  turnover?: number | null;
  pe?: number | null;
  pb?: number | null;
  amplitude?: number | null;
  /** 流通市值（亿元） */
  floatMarketCap?: number | null;
  /** 总市值（亿元） */
  totalMarketCap?: number | null;
  timestamp?: string;
}

const toNum = (raw: string | undefined): number | null => {
  if (raw == null || raw === '' || raw === '-') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export function parseTencentQuotes(raw: string): QuoteSnapshot[] {
  const snapshots: QuoteSnapshot[] = [];
  const re = /v_(sh|sz|bj)(\d{6})="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const market = match[1];
    const code = match[2];
    const fields = match[3].split('~');
    if (fields.length < 47) {
      continue;
    }
    const price = toNum(fields[3]);
    const prevClose = toNum(fields[4]) ?? 0;
    if (price == null || price <= 0) {
      continue;
    }
    snapshots.push({
      symbol: `${market}${code}`,
      code,
      name: fields[1] ?? '',
      price,
      prevClose,
      open: toNum(fields[5]) ?? price,
      high: toNum(fields[33]) ?? price,
      low: toNum(fields[34]) ?? price,
      change: toNum(fields[31]) ?? price - prevClose,
      changePct: toNum(fields[32]) ?? (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0),
      volume: toNum(fields[36]) ?? 0,
      amountWan: toNum(fields[37]) ?? 0,
      turnover: toNum(fields[38]),
      pe: toNum(fields[39]),
      pb: toNum(fields[46]),
      amplitude: toNum(fields[43]),
      floatMarketCap: toNum(fields[44]),
      totalMarketCap: toNum(fields[45]),
      timestamp: fields[30] ?? ''
    });
  }
  return snapshots;
}

export function buildTencentQuoteUrl(symbols: string[]): string {
  return `https://qt.gtimg.cn/q=${symbols.join(',')}`;
}

// 新浪备用：hq.sinajs.cn 返回 GBK 文本 var hq_str_sh600519="名称,今开,昨收,现价,最高,最低,...,日期,时间";
// 注意成交量单位为股，统一换算为手。
export function parseSinaQuotes(raw: string): QuoteSnapshot[] {
  const snapshots: QuoteSnapshot[] = [];
  const re = /var hq_str_(sh|sz|bj)(\d{6})="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const market = match[1];
    const code = match[2];
    const fields = match[3].split(',');
    if (fields.length < 32) {
      continue;
    }
    const price = toNum(fields[3]);
    const prevClose = toNum(fields[2]) ?? 0;
    if (price == null || price <= 0) {
      continue;
    }
    const high = toNum(fields[4]) ?? price;
    const low = toNum(fields[5]) ?? price;
    snapshots.push({
      symbol: `${market}${code}`,
      code,
      name: fields[0] ?? '',
      price,
      prevClose,
      open: toNum(fields[1]) ?? price,
      high,
      low,
      change: price - prevClose,
      changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      volume: Math.round((toNum(fields[8]) ?? 0) / 100),
      amountWan: Math.round(((toNum(fields[9]) ?? 0) / 10000) * 100) / 100,
      timestamp: `${fields[30] ?? ''} ${fields[31] ?? ''}`.trim()
    });
  }
  return snapshots;
}

export function buildSinaQuoteUrl(symbols: string[]): string {
  return `https://hq.sinajs.cn/list=${symbols.join(',')}`;
}

/** 裸代码补全市场前缀：6 开头沪市，0/3 开头深市；已带前缀原样返回。 */
export function normalizeSymbol(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{6}$/.test(trimmed)) {
    if (trimmed.startsWith('6')) {
      return `sh${trimmed}`;
    }
    return `sz${trimmed}`;
  }
  return trimmed;
}

// ---------- 腾讯搜索联想（smartbox，主搜索源） ----------

// 上游实测记录（2026-10-31，curl smartbox.gtimg.cn）：
// ① 「银行」t=all&l=30 → 10 条全 type=ETF（无 GP-A）；l=30 与 l=10 返回完全相同 → 加大 l 仅提高
//    具体股票名/多候选场景的召回余量，对行业词无效（l=50 也只回 20 条 ETF，同结论）；
// ② t=husband「银行」→ v_hint="N"（无效类型）；
// ③ 「工商银行」t=all → 首条 sh601398 GP-A；拼音「yh」→ 全 GP-A；具体名/拼音联想在现有解析下正常。
// 因此行业词的空结果不由本接口修复：由 sectors() 三级容灾（东财→腾讯 rank→新浪）恢复后，
// search() 的 sectorSearchFromEastmoney 名称包含匹配可命中「银行」等板块（market-data.service.ts）。
export function buildTencentSuggestUrl(keyword: string, limit = 30): string {
  return `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(keyword)}&t=all&l=${limit}`;
}

export interface SuggestItem {
  symbol: string;
  code: string;
  name: string;
  type: 'stock' | 'index';
}

/**
 * smartbox 返回 GBK 文本：v_hint="sh~600519~\u8d35\u5dde\u8305\u53f0~gzmt~GP-A^..."，
 * 条目以 ^ 分隔，字段以 ~ 分隔（市场/代码/名称/拼音/类型），名称为 \uXXXX 转义。
 * 仅保留沪深 A 股（GP-A）与指数（ZS）。
 */
export function parseTencentSuggest(raw: string): SuggestItem[] {
  const match = raw.match(/v_hint="([^"]*)"/);
  if (!match || !match[1] || match[1] === 'N') {
    return [];
  }
  const decodeName = (value: string) =>
    value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const items: SuggestItem[] = [];
  for (const entry of match[1].split('^')) {
    const fields = entry.split('~');
    if (fields.length < 5) {
      continue;
    }
    const [market, code, rawName, , type] = fields;
    const name = decodeName(rawName);
    if (!/^(sh|sz)$/.test(market) || !/^\d{6}$/.test(code) || !name) {
      continue;
    }
    const isIndex = type === 'ZS' || name.includes('指数');
    const isStock = type === 'GP-A';
    if (!isStock && !isIndex) {
      continue;
    }
    items.push({ symbol: `${market}${code}`, code, name, type: isIndex ? 'index' : 'stock' });
  }
  return items.slice(0, 10);
}

// ---------- 腾讯日 K 线（东财被限流时的备用源） ----------

export interface TencentKlineResponse {
  code?: number;
  data?: Record<string, { qfqday?: string[][]; day?: string[][] }>;
}

export function buildTencentKlineUrl(symbol: string, limit = 320): string {
  return `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${limit},qfq`;
}

/** 腾讯 K 线行：[日期, 开, 收, 高, 低, 量(手)]；涨跌幅由前收推算，成交额缺失记 0。 */
export function parseTencentKline(payload: TencentKlineResponse, limit: number): { name: string; items: KlineItem[] } {
  const first = Object.values(payload?.data ?? {})[0];
  const rows = first?.qfqday ?? first?.day ?? [];
  const items: KlineItem[] = [];
  for (const row of rows) {
    if (row.length < 6) {
      continue;
    }
    const open = Number(row[1]);
    const close = Number(row[2]);
    const high = Number(row[3]);
    const low = Number(row[4]);
    const volume = Number(row[5]);
    if (![open, close, high, low].every((v) => Number.isFinite(v) && v > 0)) {
      continue;
    }
    const prev = items[items.length - 1];
    items.push({
      date: row[0],
      open,
      close,
      high,
      low,
      volume: Number.isFinite(volume) ? volume : 0,
      amount: 0,
      pct: prev && prev.close > 0 ? ((close - prev.close) / prev.close) * 100 : undefined
    });
  }
  return { name: '', items: items.slice(-limit) };
}

// ---------- 腾讯分钟 K 线（60min 兜底源） ----------

// 上游实测记录（2026-10-31，curl sh600519 m60）：
// - web.ifzq.gtimg.cn/appstock/app/kline/mkline 返回 301 Moved Permanently（不可直连）；
// - 同路径经 proxy.finance.qq.com/ifzqgtimg/... 返回 code:0，data.<symbol> 含 qt/m60/prec 三键，
//   m60 行结构 ["202610301030","1363.00","1370.71","1376.00","1354.25","21469.00",{},"17.17"]，
//   即 [YYYYMMDDHHmm, 开, 收, 高, 低, 量(手), 信息占位对象, 附加字段]；12 位数字 date 解析时
//   格式化为 "YYYY-MM-DD HH:mm"，与东财/新浪口径一致（非 12 位形态原样保留，容错）。
export interface TencentMinuteKlineResponse {
  code?: number;
  data?: Record<string, Record<string, unknown>>;
}

/** 腾讯分钟 K URL：period=m60（60 分钟），limit 为根数。 */
export function buildTencentMinuteKlineUrl(symbol: string, period: 'm60', limit = 250): string {
  return `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/mkline?param=${symbol},${period},,${limit}`;
}

/** 腾讯分钟 K 解析：行结构见上方实测记录；date 格式化为 "YYYY-MM-DD HH:mm"，涨跌幅由前收推算，成交额缺失记 0。 */
export function parseTencentMinuteKline(
  payload: TencentMinuteKlineResponse,
  period: 'm60',
  limit: number
): { name: string; items: KlineItem[] } {
  const first = Object.values(payload?.data ?? {})[0] as Record<string, unknown> | undefined;
  const raw = first?.[period];
  const rows = Array.isArray(raw) ? (raw as unknown[][]) : [];
  const items: KlineItem[] = [];
  for (const row of rows) {
    if (row.length < 6) {
      continue;
    }
    const open = Number(row[1]);
    const close = Number(row[2]);
    const high = Number(row[3]);
    const low = Number(row[4]);
    const volume = Number(row[5]);
    if (![open, close, high, low].every((v) => Number.isFinite(v) && v > 0)) {
      continue;
    }
    const prev = items[items.length - 1];
    // 12 位 YYYYMMDDHHmm 统一格式化为 "YYYY-MM-DD HH:mm"（与东财/新浪展示口径一致），
    // 其余形态（异常字段）原样保留，不做猜测性解析。
    const rawDate = String(row[0] ?? '');
    const date = /^\d{12}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)} ${rawDate.slice(8, 10)}:${rawDate.slice(10, 12)}`
      : rawDate;
    items.push({
      date,
      open,
      close,
      high,
      low,
      volume: Number.isFinite(volume) ? volume : 0,
      amount: 0,
      pct: prev && prev.close > 0 ? ((close - prev.close) / prev.close) * 100 : undefined
    });
  }
  return { name: '', items: items.slice(-limit) };
}

// ---------- 新浪日 K 线（第三级备用） ----------

/** 新浪 K 线：scale=240 日 K（默认不变）/ 60 分钟；分钟档 date 为 "2026-10-29 15:00:00" 带时分秒，
 *  parseSinaKline 对 date 原样保留、解析通用（2026-10-31 实测 scale=60 返回 JSONP 数组正常）。 */
export function buildSinaKlineUrl(symbol: string, limit = 280, scale: 60 | 240 = 240): string {
  return (
    `https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_%3D%20/CN_MarketDataService.getKLineData` +
    `?symbol=${symbol}&scale=${scale}&ma=no&datalen=${limit}`
  );
}

interface SinaKlineRow {
  day?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

/** 新浪 K 线：JSONP 包裹的 JSON 数组，量单位为股（换算为手）。 */
export function parseSinaKline(raw: string, limit: number): { name: string; items: KlineItem[] } {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  const items: KlineItem[] = [];
  if (start < 0 || end <= start) {
    return { name: '', items };
  }
  try {
    const rows = JSON.parse(raw.slice(start, end + 1)) as SinaKlineRow[];
    for (const row of rows) {
      const open = Number(row.open);
      const close = Number(row.close);
      const high = Number(row.high);
      const low = Number(row.low);
      if (![open, close, high, low].every((v) => Number.isFinite(v) && v > 0)) {
        continue;
      }
      const prev = items[items.length - 1];
      items.push({
        date: row.day ?? '',
        open,
        close,
        high,
        low,
        volume: Math.round((Number(row.volume) || 0) / 100),
        amount: 0,
        pct: prev && prev.close > 0 ? ((close - prev.close) / prev.close) * 100 : undefined
      });
    }
  } catch {
    // JSONP 解析失败按空处理。
  }
  return { name: '', items: items.slice(-limit) };
}


