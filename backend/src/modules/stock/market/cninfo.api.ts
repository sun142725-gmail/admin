// 巨潮资讯（cninfo）公告适配器：官方权威公告源，POST 查询。
// 流程：代码 → orgId（topSearch）→ 公告列表（hisAnnouncement）。
// 解析与网络分离，可用 fixture 单测。

export interface CninfoOrgRow {
  code?: string;
  orgId?: string;
  zwjc?: string;
}

export interface AnnouncementItem {
  title: string;
  /** 发布日期 YYYY-MM-DD。 */
  date: string;
}

export interface CninfoAnnouncementRow {
  announcementTitle?: string;
  announcementTime?: number;
  secName?: string;
}

export function buildCninfoOrgUrl(): string {
  return 'http://www.cninfo.com.cn/new/information/topSearch/query';
}

export function cninfoOrgBody(code: string): string {
  return `keyWord=${encodeURIComponent(code)}&maxNum=10`;
}

/** 从联想结果中按代码精确匹配 orgId（沪市 column=sse，深/创 column=szse）。 */
export function parseCninfoOrg(rows: CninfoOrgRow[], code: string): { orgId: string; column: 'sse' | 'szse' } | null {
  const hit = (rows ?? []).find((row) => row.code === code);
  if (!hit?.orgId) {
    return null;
  }
  return { orgId: hit.orgId, column: code.startsWith('6') ? 'sse' : 'szse' };
}

export function buildCninfoAnnouncementUrl(): string {
  return 'http://www.cninfo.com.cn/new/hisAnnouncement/query';
}

export function cninfoAnnouncementBody(code: string, orgId: string, column: 'sse' | 'szse', pageSize = 8): string {
  return (
    `pageNum=1&pageSize=${pageSize}&column=${column}&tabName=fulltext` +
    `&stock=${encodeURIComponent(`${code},${orgId}`)}&isHLtitle=true`
  );
}

const formatDate = (ms?: number): string => {
  if (!ms || !Number.isFinite(ms)) {
    return '';
  }
  const date = new Date(ms);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
};

/** 公告列表解析：去 HTML 高亮、按时间倒序取前 N 条。 */
export function parseCninfoAnnouncements(rows: CninfoAnnouncementRow[], limit = 8): AnnouncementItem[] {
  return (rows ?? [])
    .filter((row) => row.announcementTitle)
    .map((row) => ({
      title: String(row.announcementTitle).replace(/<[^>]+>/g, '').trim(),
      date: formatDate(row.announcementTime)
    }))
    .filter((item) => item.title)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}
