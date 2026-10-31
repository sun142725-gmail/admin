// 腾讯板块排行（东财板块列表 push2 集群被网络屏蔽时的第一兜底源）：
// proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank，board_type=hy 行业 / gn 概念。
// 解析与网络分离，均可用 fixture 字符串做单元测试。
import { SectorItem } from './eastmoney.api';

// 字段布局以 2026-10-31 实测为准（board_type=hy/gn 均 code:0）：
// code "pt01801120"（pt 前缀体系，行业 BK-HY-1 / 概念 BK-GN）、name 板块名、
// zdf 涨跌幅（字符串 "2.84"）、zgb "涨/总"（"71/122" 即涨 71 跌 51）、
// lzg 领涨股 { code:"sz000716", name:"黑芝麻", zdf:"10.08", ... }。
export interface TencentSectorRankResponse {
  code?: number;
  msg?: string;
  data?: {
    rank_list?: Array<{
      code?: string;
      name?: string;
      zdf?: number | string;
      /** 涨/总家数，形如 "71/122"。 */
      zgb?: string;
      lzg?: {
        code?: string;
        name?: string;
        zdf?: number | string;
      };
      stock_type?: string;
    }>;
  };
}

/** 腾讯板块 rank URL：hy 行业 / gn 概念，按涨跌幅（PriceRatio）从大到小。 */
export function buildTencentSectorRankUrl(boardType: 'hy' | 'gn', count = 100): string {
  return (
    'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank' +
    `?board_type=${boardType}&sort_type=PriceRatio&direct=down&offset=0&count=${count}`
  );
}

const toNumOrNull = (raw: number | string | undefined): number | null => {
  if (raw == null || raw === '') {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * 腾讯 rank 行 → SectorItem：
 * - code 加 'qqt_' 前缀防三体系冲突（东财 BKxxxx / 新浪 new_xxx / 腾讯 ptxxxx），并标 source:'tencent'；
 * - pct = zdf（非有限数置 null）；
 * - 领涨股三件套 lzg.name/lzg.code/lzg.zdf → leaderName/leaderCode/leaderPct；
 * - 涨跌家数从 zgb "71/122" 解析：upCount=71、downCount=122-71；缺失/格式非法时字段省略。
 * 缺 code/name 的行过滤；rank_list 缺失或 code!==0 返回空数组。
 */
export function parseTencentSectorRank(payload: TencentSectorRankResponse): SectorItem[] {
  if (payload?.code !== 0) {
    return [];
  }
  const rows = payload.data?.rank_list ?? [];
  const items: SectorItem[] = [];
  for (const row of rows) {
    const code = row.code ?? '';
    const name = row.name ?? '';
    if (!code || !name) {
      continue;
    }
    const upCount = parseUpCount(row.zgb);
    const item: SectorItem = {
      code: `qqt_${code}`,
      name,
      pct: toNumOrNull(row.zdf),
      source: 'tencent'
    };
    if (upCount != null) {
      item.upCount = upCount.up;
      item.downCount = Math.max(0, upCount.total - upCount.up);
    }
    if (row.lzg?.name || row.lzg?.code) {
      item.leaderName = row.lzg.name;
      item.leaderCode = row.lzg.code;
      item.leaderPct = toNumOrNull(row.lzg.zdf);
    }
    items.push(item);
  }
  return items;
}

/** zgb "71/122" → { up: 71, total: 122 }；缺失/格式非法返回 null。 */
function parseUpCount(raw: string | undefined): { up: number; total: number } | null {
  if (!raw || !raw.includes('/')) {
    return null;
  }
  const [upRaw, totalRaw] = raw.split('/');
  const up = Number(upRaw);
  const total = Number(totalRaw);
  if (!Number.isFinite(up) || !Number.isFinite(total) || total < 0 || up < 0 || up > total) {
    return null;
  }
  return { up: Math.round(up), total: Math.round(total) };
}

/** 腾讯板块代码判别：qqt_ 前缀（与 sina-sector.api.ts 两判别函数并列同款）。 */
export function isTencentSectorCode(symbol: string): boolean {
  return /^qqt_[a-z0-9_]+$/i.test(symbol.trim());
}
