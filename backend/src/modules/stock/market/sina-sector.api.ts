// 新浪行业板块（东财板块接口被限流时的备用源）：
// 列表 newSinaHy.php（GBK JS 变量），成分行情 Market_Center.getHQNodeData（JSON，按节点查询）。
// 板块代码体系与东财不同（new_xxx vs BKxxxx），SectorItem 通过 source 字段区分。

export interface SinaSectorRaw {
  code: string;
  name: string;
}

/** newSinaHy.php 返回：var S_Finance_bankuai_sinaindustry = {"new_blhy":"new_blhy,玻璃行业,19,14.77,..."} */
export function parseSinaSectorList(raw: string): SinaSectorRaw[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return [];
  }
  try {
    const map = JSON.parse(raw.slice(start, end + 1)) as Record<string, string>;
    return Object.values(map)
      .map((value) => {
        const fields = value.split(',');
        return { code: fields[0] ?? '', name: fields[1] ?? '' };
      })
      .filter((item) => /^new_/.test(item.code) && item.name);
  } catch {
    return [];
  }
}

export function buildSinaSectorListUrl(): string {
  return 'https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php';
}

export interface SinaConstituent {
  symbol: string;
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  amount: number;
  turnover: number | null;
  pe: number | null;
  pb: number | null;
}

interface SinaConstituentRow {
  symbol?: string;
  code?: string;
  name?: string;
  trade?: string | number;
  changepercent?: number | string;
  volume?: number | string;
  amount?: number | string;
  turnoverratio?: number | string;
  per?: number | string;
  pb?: number | string;
}

const numOf = (v: number | string | undefined): number | null => {
  if (v == null || v === '') {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 成分股行情（node = new_xxx 板块代码；新浪返回 UTF-8 JSON 数组，GBK 由调用层处理差异）。 */
export function parseSinaConstituents(payload: SinaConstituentRow[]): SinaConstituent[] {
  return (Array.isArray(payload) ? payload : [])
    .map((row) => ({
      symbol: row.symbol ?? '',
      code: row.code ?? '',
      name: row.name ?? '',
      price: numOf(row.trade) ?? 0,
      changePct: numOf(row.changepercent) ?? 0,
      volume: numOf(row.volume) ?? 0,
      amount: numOf(row.amount) ?? 0,
      turnover: numOf(row.turnoverratio),
      pe: numOf(row.per),
      pb: numOf(row.pb)
    }))
    .filter((item) => item.symbol && item.name && item.price > 0);
}

export function buildSinaNodeUrl(node: string, pageSize = 100): string {
  return (
    'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData' +
    `?page=1&num=${pageSize}&sort=changepercent&asc=0&node=${encodeURIComponent(node)}&symbol=&_s_r_a=page`
  );
}

/** 板块代码判别：东财 BKxxxx / 新浪 new_xxx。 */
export function isSinaSectorCode(symbol: string): boolean {
  return /^new_[a-z0-9_]+$/i.test(symbol.trim());
}

export function isEastmoneySectorCode(symbol: string): boolean {
  return /^BK\d{4,6}$/i.test(symbol.trim());
}
