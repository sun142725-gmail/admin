// 同花顺 F10 财务字段适配器：抓个股主页服务端渲染的核心指标（best-effort，
// 页面改版/反爬时静默失败退化为"财务明细暂缺"，不伤会议主流程）。

export interface ThsFinancials {
  /** 每股收益（元）。 */
  eps: number | null;
  /** 营业总收入（亿元）。 */
  revenueYi: number | null;
  /** 营收同比（%，如 1.3 表示 +1.3%）。 */
  revenueYoy: number | null;
  /** 毛利率 %。 */
  grossMargin: number | null;
  /** 净资产收益率 %。 */
  roe: number | null;
  /** 动态市盈率。 */
  peDynamic: number | null;
}

export function buildThsF10Url(code: string): string {
  return `https://basic.10jqka.com.cn/${code}/`;
}

const loose = (label: string, unitPattern: string): RegExp =>
  // 剥标签后的纯文本上匹配：字段名后允许隔少量非数字字符再取数值。
  new RegExp(`${label}[：:][^0-9\\-+]{0,60}?([\\d.]+)\\s*${unitPattern}`);

/** 从 F10 主页 HTML（GBK 解码后）提取核心财务字段；全部缺失返回 null。 */
export function parseThsFinancials(html: string): ThsFinancials | null {
  if (!html || html.length < 1000) {
    return null;
  }
  // 先剥离全部标签：字段名与数值之间常隔含数字的标签属性（data-url 哈希等），不剥则正则被截断。
  const text = html.replace(/<[^>]+>/g, ' ');
  const grab = (re: RegExp): number | null => {
    const match = text.match(re);
    if (!match) {
      return null;
    }
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };

  const eps = grab(loose('每股收益', '元'));
  // 营业总收入：922.78亿元 同比增长1.3%
  const revenueMatch = text.match(/营业总收入[：:][^0-9\-+]{0,60}?([\d,.]+)\s*(亿|万)?元(?:[^0-9\-+]{0,40}(?:同比增长|较上年同期)([-+\d.]+)%?)?/);
  let revenueYi: number | null = null;
  let revenueYoy: number | null = null;
  if (revenueMatch) {
    const raw = Number(revenueMatch[1].replace(/,/g, ''));
    if (Number.isFinite(raw)) {
      revenueYi = revenueMatch[2] === '万' ? Math.round((raw / 10000) * 100) / 100 : raw;
    }
    if (revenueMatch[3]) {
      const yoy = Number(revenueMatch[3]);
      revenueYoy = Number.isFinite(yoy) ? yoy : null;
    }
  }
  const grossMargin = grab(loose('毛利率', '%'));
  const roe = grab(loose('净资产收益率', '%'));
  const peDynamic = grab(loose('市盈率\\(动态\\)', ''));

  const financials: ThsFinancials = { eps, revenueYi, revenueYoy, grossMargin, roe, peDynamic };
  const hasAny = Object.values(financials).some((value) => value != null);
  return hasAny ? financials : null;
}
