// 圆桌专家定义：人设、系统提示词、立场解析、数据简报渲染与本地规则兜底。
// 本文件保持零 Nest 依赖（纯常量与纯函数），同步脚本与单元测试可直接复用。
import { IndicatorSummary, RuleSignals, computeRuleSignals, scoreToStance } from './indicators.util';
import { QuoteSnapshot } from './market/tencent-quote.api';
import { MarketOverview, MarketBreadth } from './market/market-data.service';

export interface ExpertDefinition {
  code: string;
  name: string;
  /** 流派标签（前端徽章）。 */
  school: string;
  systemPrompt: string;
  temperature: string;
}

export interface Stance {
  direction: 'bull' | 'bear' | 'neutral';
  confidence: number;
  keyPoints: string;
}

export type ConclusionDirection = 'bull' | 'bear' | 'neutral' | 'watch';

const STANCE_FORMAT_RULES = `
## 输出格式（必须严格遵守）
1. 回复的第一行到第三行必须是以下三行机器标签（系统靠它解析立场，缺失会导致你的观点无法计入投票），之后空一行再写正文：
【立场】看多 或 【立场】看空 或 【立场】中性（三选一）
【置信度】0-100 的整数
【核心依据】一句话，不超过 40 字
2. 正文用中文，先结论后论证，200~350 字，必须引用数据简报中的具体数值；不要自行输出"最终判断"等替代格式`;

export const EXPERT_DEFINITIONS: ExpertDefinition[] = [
  {
    code: 'stock-trend',
    name: '道远',
    school: '趋势派',
    systemPrompt: `你是「道远」，股市圆桌会议的趋势专家，道氏理论与均线系统的忠实信徒。

## 方法论
MA5/10/20/60 均线排列、MACD（DIF/DEA/柱）金叉死叉与背离、布林带通道位置、趋势结构（高低点抬升或降低）。

## 性格与原则
沉稳克制，只信右侧交易，反对摸顶抄底；所有判断必须落到具体数字上。
趋势不明时坦承"方向未选择"，绝不硬站队。`,
    temperature: '0.50'
  },
  {
    code: 'stock-momentum',
    name: '小雷',
    school: '动量派',
    systemPrompt: `你是「小雷」，股市圆桌会议的动量专家，短线猎手。

## 方法论
KDJ（K/D/J 与金叉）、RSI（6/12/24）超买超卖、乖离率、涨跌节奏与振幅、5/20/60 日涨跌幅对比。

## 性格与原则
激进敏锐，语速快，眼里只有时机与赔率；超买敢喊回调，超跌敢喊反弹。
但你要明确：短线信号与中期趋势冲突时，必须点出来而不是装看不见。`,
    temperature: '0.70'
  },
  {
    code: 'stock-flow',
    name: '墨量',
    school: '量价派',
    systemPrompt: `你是「墨量」，股市圆桌会议的量价专家，专职追踪资金行为。

## 方法论
成交量结构（量比、5 日均量对比）、OBV 能量潮方向、换手率含义（缩量上涨/放量下跌等组合）、涨跌家数与板块资金迁移。

## 性格与原则
疑心重，口头禅是"量在价先""无量上涨都是耍流氓"；价格可以骗人，成交量不会。
你会特别警惕放量滞涨与缩量新高这类"对倒"信号。`,
    temperature: '0.60'
  },
  {
    code: 'stock-value',
    name: '守拙',
    school: '价值派',
    systemPrompt: `你是「守拙」，股市圆桌会议的价值专家，长期主义者。

## 方法论
估值框架（市盈率、市净率、市值量级）、财务摘要（每股收益/营收增速/毛利率/ROE）、价格在 52 周区间中的位置、波动率（ATR）与安全边际、中长期涨跌幅的均值回归。

## 消息面职责
简报中的【财务摘要】【近期公告】【消息面参考】是你的核心弹药：财报/业绩类公告必须显式解读（基于标题与数字判断事件性质与方向），回购/增持偏利好，减持/质押/诉讼/会计变更偏风险；消息面参考中标注"未证实"的内容只能作为疑点提出，不能当作事实。

## 性格与原则
语速慢，反投机，信奉"短期是投票机，长期是称重机"。
数据简报缺乏财务明细时，就估值水位与位置结构发言，不编造无法验证的基本面。`,
    temperature: '0.40'
  },
  {
    code: 'stock-risk',
    name: '谨言',
    school: '风控派',
    systemPrompt: `你是「谨言」，股市圆桌会议的空头检察官，魔鬼代言人。

## 职责与方法论
你的天职就是否定：对任何看多结论进行情景推演（乐观/中性/悲观三情景）、列黑天鹅清单、
检查波动率（ATR%）与位置风险（接近区间高点？）、给出止损位与仓位纪律建议。

## 消息面职责
【近期公告】中必须点名风险最大的一条并推演其影响（减持/质押/诉讼/监管函/会计变更优先级最高）；
【消息面参考】里的负面传闻即使未证实也要列入风险清单并标注"待证实"。

## 性格与原则
冷静刻薄但讲证据，每个反对意见都要引用数据；问自己"如果他们错了，代价是什么"。
即使你同意多数人看多，也必须把最坏情景说透；你的立场标签代表"风险收益比"而非方向爱好。`,
    temperature: '0.60'
  }
];

export const MODERATOR_DEFINITION: ExpertDefinition = {
  code: 'stock-moderator',
  name: '衡之',
  school: '会议主席',
  systemPrompt: `你是「衡之」，股市圆桌会议的主席，中立主持人，拥有最终裁决权。

## 职责
汇总五位专家（趋势/动量/量价/价值/风控）经过独立分析与多轮交叉辩论后的发言，产出严谨、可执行的会议纪要。
观点必须来自专家发言与数据简报，不得凭空编造。

## 裁决规则
- 辩论已收敛（专家立场趋于稳定）→ 明确表述"共识达成"及其形成过程（谁被说服、依据什么）；
- 分歧不可调和 → 你必须给出裁决性结论：倾向哪一方、为什么、什么条件下应改判（触发信号/价位/事件）；
- 任何情况下不得和稀泥式总结，"都有道理"不是结论。

## 输出格式（必须严格遵守，中文 600~900 字）
## 会议结论
2~3 句话给出整体判断（含裁决意见），然后单独一行严格输出：【结论】看多 或 【结论】看空 或 【结论】中性 或 【结论】观望（四选一）
## 多空投票
一句话概括专家立场分布（X 看多 / Y 看空 / Z 中性）
## 共识观点
2~4 条专家一致认同的点，引用具体数字
## 主要分歧
点出多空双方争执的核心焦点与裁决意见
## 事件与消息面
近期最需关注的事件变量（财报/公告/消息面；简报未包含消息面数据时如实写"本次未获取消息面数据"）
## 操作建议
关注价位区间、仓位思路、时间窗口等具体建议，注明"仅供参考"
## 风险提示
主要风险情景与应对（止损纪律等）`,
  temperature: '0.30'
};

// ---------- 立场与结论解析 ----------

const BULL_WORDS = ['看多', '偏多', '看涨', '买入', '增持', '加仓', '金叉', '多头', '突破确认', '上行', '上涨', '回升', '反弹'];
const BEAR_WORDS = ['看空', '偏空', '看跌', '卖出', '减持', '回避', '死叉', '空头', '破位', '转弱', '下跌', '下行', '看淡'];

/**
 * 立场解析（三级容错）：
 * 1. 严格【立场】标签；2. "最终判断/结论…"行的方向关键词；3. 结尾段落关键词计分（弱置信）。
 * 强模型偶尔忽略标签格式，靠 2/3 兜底保证投票不缺失。
 */
export function parseStance(text: string): Stance | null {
  const dirMatch = text.match(/【立场】\s*(看多|看空|中性)/);
  if (dirMatch) {
    const confMatch = text.match(/【置信度】\s*(\d{1,3})/);
    const keyMatch = text.match(/【核心依据】\s*([^\n]+)/);
    return {
      direction: dirMatch[1] === '看多' ? 'bull' : dirMatch[1] === '看空' ? 'bear' : 'neutral',
      confidence: Math.max(0, Math.min(100, Number(confMatch?.[1] ?? 60))),
      keyPoints: (keyMatch?.[1] ?? '').trim().slice(0, 60)
    };
  }

  // 二级：结论行的方向关键词。
  const conclusionMatch = text.match(
    /(?:最终判断|综合判断|总体判断|独立判断|总结论|结论|立场|观点)[：:]?\s*([^\n]{4,80})/
  );
  const scoreLine = (line: string): 'bull' | 'bear' | null => {
    const bull = BULL_WORDS.filter((word) => line.includes(word)).length;
    const bear = BEAR_WORDS.filter((word) => line.includes(word)).length;
    if (bull > bear) {
      return 'bull';
    }
    if (bear > bull) {
      return 'bear';
    }
    return null;
  };
  if (conclusionMatch) {
    const direction = scoreLine(conclusionMatch[1]);
    if (direction) {
      return { direction, confidence: 45, keyPoints: conclusionMatch[1].trim().slice(0, 60) };
    }
    // 结论行多空措辞打平（如"下跌趋势中的强反弹"）按中性计，保证投票完整。
    return { direction: 'neutral', confidence: 40, keyPoints: conclusionMatch[1].trim().slice(0, 60) };
  }

  // 三级：结尾 400 字关键词计分。
  const tail = text.slice(-400);
  const direction = scoreLine(tail);
  if (direction) {
    return { direction, confidence: 40, keyPoints: '由发言措辞推断（未输出立场标签）' };
  }
  return null;
}

export function parseConclusion(text: string): ConclusionDirection | null {
  const match = text.match(/【结论】\s*(看多|看空|中性|观望)/);
  if (!match) {
    return null;
  }
  const map: Record<string, ConclusionDirection> = { 看多: 'bull', 看空: 'bear', 中性: 'neutral', 观望: 'watch' };
  return map[match[1]] ?? null;
}

// ---------- 辩论收敛检测 ----------

export interface ConvergenceCheck {
  /** 本轮相对上轮立场翻转的专家数。 */
  stanceShift: number;
  flipped: string[];
  /** 立场已收敛（无人翻转）→ 达到相对平衡点，可交主席裁决。 */
  converged: boolean;
}

/** 比较第 currentRound 轮与上一轮各专家立场：无人翻转 = 收敛（相对平衡点）。 */
export function computeDebateConvergence(
  turns: Array<{ expertCode: string; round: number; stance?: Stance | null; ok: boolean }>,
  currentRound: number
): ConvergenceCheck {
  const stanceAt = (round: number) => {
    const map = new Map<string, Stance>();
    for (const turn of turns) {
      if (turn.round === round && turn.ok && turn.stance) {
        map.set(turn.expertCode, turn.stance);
      }
    }
    return map;
  };
  const prev = stanceAt(currentRound - 1);
  const curr = stanceAt(currentRound);
  const flipped: string[] = [];
  curr.forEach((stance, code) => {
    const before = prev.get(code);
    if (before && before.direction !== stance.direction) {
      flipped.push(code);
    }
  });
  return { stanceShift: flipped.length, flipped, converged: flipped.length === 0 };
}

export function directionLabel(direction: Stance['direction']): string {
  return direction === 'bull' ? '看多' : direction === 'bear' ? '看空' : '中性';
}

// ---------- 数据简报渲染 ----------

const fmt = (v: number | null | undefined, suffix = ''): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v}${suffix}`;

export function renderSnapshotSection(snapshot: QuoteSnapshot): string {
  return [
    `现价 ${fmt(snapshot.price)}（${snapshot.change >= 0 ? '+' : ''}${fmt(snapshot.change)} / ${snapshot.changePct >= 0 ? '+' : ''}${fmt(snapshot.changePct)}%）`,
    `今开 ${fmt(snapshot.open)}｜最高 ${fmt(snapshot.high)}｜最低 ${fmt(snapshot.low)}｜昨收 ${fmt(snapshot.prevClose)}`,
    `振幅 ${fmt(snapshot.amplitude, '%')}｜换手 ${fmt(snapshot.turnover, '%')}｜量比见下｜成交额 ${fmt(snapshot.amountWan, '万')}`,
    `PE(TTM) ${fmt(snapshot.pe)}｜PB ${fmt(snapshot.pb)}｜总市值 ${fmt(snapshot.totalMarketCap, '亿')}`
  ].join('\n');
}

export function renderIndicatorSection(summary: IndicatorSummary): string {
  const macdCrossText =
    summary.macdCross === 'none'
      ? '无近期交叉'
      : `${summary.macdCross === 'golden' ? '金叉' : '死叉'}（${summary.macdCrossAgo} 个交易日前）`;
  const kdjZone =
    (summary.kdj.j ?? 50) > 100 ? 'J 值超买' : (summary.kdj.j ?? 50) < 0 ? 'J 值超卖' : 'J 值正常区间';
  const rsiZone = (summary.rsi.rsi6 ?? 50) > 80 ? 'RSI6 超买' : (summary.rsi.rsi6 ?? 50) < 30 ? 'RSI6 超卖' : 'RSI 正常区间';
  return [
    `均线：MA5 ${fmt(summary.ma.ma5)}｜MA10 ${fmt(summary.ma.ma10)}｜MA20 ${fmt(summary.ma.ma20)}｜MA60 ${fmt(summary.ma.ma60)}，排列${
      summary.maAlignment === 'bull' ? '多头（MA5>MA10>MA20>MA60）' : summary.maAlignment === 'bear' ? '空头（MA5<MA10<MA20<MA60）' : '纠缠'
    }，价格相对 MA20 乖离 ${fmt(summary.priceVsMa20, '%')}`,
    `MACD：DIF ${fmt(summary.macd.dif)}｜DEA ${fmt(summary.macd.dea)}｜柱 ${fmt(summary.macd.histogram)}，${macdCrossText}`,
    `KDJ：K ${fmt(summary.kdj.k)}｜D ${fmt(summary.kdj.d)}｜J ${fmt(summary.kdj.j)}，${summary.kdjGolden ? '近 3 日内出现金叉，' : ''}${kdjZone}`,
    `RSI：RSI6 ${fmt(summary.rsi.rsi6)}｜RSI12 ${fmt(summary.rsi.rsi12)}｜RSI24 ${fmt(summary.rsi.rsi24)}，${rsiZone}`,
    `布林：上轨 ${fmt(summary.boll.upper)}｜中轨 ${fmt(summary.boll.mid)}｜下轨 ${fmt(summary.boll.lower)}，价格位于带内 ${fmt(summary.bollPosition, '%')} 处`,
    `量能：今日 ${summary.volume.today} 手 / 5 日均量 ${summary.volume.avg5} 手，量比 ${fmt(summary.volume.ratio)}，OBV 五日趋势${{
      up: '向上（资金流入迹象）',
      down: '向下（资金流出迹象）',
      flat: '走平'
    }[summary.volume.obvTrend]}`,
    `波动与位置：ATR 占价 ${fmt(summary.atrPct, '%')}；区间最高 ${fmt(summary.range.high)} / 最低 ${fmt(summary.range.low)}，现价位于区间 ${summary.range.position}% 分位`,
    `区间涨跌：近 1 日 ${fmt(summary.pct1d, '%')}｜近 5 日 ${fmt(summary.pct5d, '%')}｜近 20 日 ${fmt(summary.pct20d, '%')}｜近 60 日 ${fmt(summary.pct60d, '%')}`
  ].join('\n');
}

export function renderRecentTable(summary: IndicatorSummary): string {
  return summary.recent
    .map(
      (k) =>
        `${k.date}｜开 ${k.open}｜收 ${k.close}｜高 ${k.high}｜低 ${k.low}｜量 ${k.volume} 手｜${
          k.pct != null ? `${k.pct >= 0 ? '+' : ''}${k.pct}%` : '—'
        }`
    )
    .join('\n');
}

export function renderOverviewSection(overview: MarketOverview | null): string {
  if (!overview) {
    return '大盘环境数据暂缺';
  }
  const indexText = overview.indexes
    .map((idx) => `${idx.name} ${fmt(idx.price)}（${idx.changePct >= 0 ? '+' : ''}${fmt(idx.changePct)}%）`)
    .join('；');
  const breadth: MarketBreadth | null = overview.breadth;
  const topText = overview.topSectors
    .slice(0, 3)
    .map((s) => `${s.name} ${fmt(s.pct, '%')}`)
    .join('、');
  const bottomText = overview.bottomSectors
    .slice(0, 3)
    .map((s) => `${s.name} ${fmt(s.pct, '%')}`)
    .join('、');
  return [
    `指数：${indexText}`,
    breadth ? `涨跌家数（行业板块加总，近似）：上涨 ${breadth.up} / 下跌 ${breadth.down}` : '',
    `领涨板块：${topText || '—'}；领跌板块：${bottomText || '—'}`
  ]
    .filter(Boolean)
    .join('\n');
}

export interface BriefParts {
  subjectName: string;
  subjectType: string;
  snapshot?: QuoteSnapshot | null;
  summary?: IndicatorSummary | null;
  overview?: MarketOverview | null;
  sectorInfo?: {
    name: string;
    pct: number | null;
    upCount?: number;
    downCount?: number;
    leaderName?: string;
    note?: string;
  } | null;
  constituents?: Array<{ name: string; pct: number | null }> | null;
  /** 近期官方公告（巨潮，个股场景）。 */
  announcements?: Array<{ title: string; date: string }> | null;
  /** 核心财务字段（同花顺 F10，best-effort）。 */
  financials?: {
    eps: number | null;
    revenueYi: number | null;
    revenueYoy: number | null;
    grossMargin: number | null;
    roe: number | null;
    peDynamic: number | null;
  } | null;
  /** 消息面调研文本（模型联网检索或知识注入，已含时效标注）。 */
  newsDigest?: string | null;
  dateText: string;
}

/** 组装给专家的完整数据简报（纯文本，控制体量）。 */
export function renderBriefText(parts: BriefParts): string {
  const sections: string[] = [];
  sections.push(`分析对象：${parts.subjectName}（类型：${parts.subjectType}）｜数据日期：${parts.dateText}`);
  if (parts.snapshot) {
    sections.push(`【行情快照】\n${renderSnapshotSection(parts.snapshot)}`);
  }
  if (parts.sectorInfo) {
    sections.push(
      `【板块概况】${parts.sectorInfo.name} 今日 ${fmt(parts.sectorInfo.pct, '%')}，板块内上涨 ${
        parts.sectorInfo.upCount ?? '—'
      } 家 / 下跌 ${parts.sectorInfo.downCount ?? '—'} 家，领涨股 ${parts.sectorInfo.leaderName ?? '—'}${
        parts.sectorInfo.note ? `（${parts.sectorInfo.note}）` : ''
      }`
    );
  }
  if (parts.constituents && parts.constituents.length > 0) {
    sections.push(
      `【板块成分股涨幅前列】${parts.constituents.map((c) => `${c.name} ${fmt(c.pct, '%')}`).join('、')}`
    );
  }
  if (parts.summary) {
    sections.push(`【技术指标】\n${renderIndicatorSection(parts.summary)}`);
    sections.push(`【近 10 个交易日】\n${renderRecentTable(parts.summary)}`);
  }
  if (parts.financials) {
    const f = parts.financials;
    sections.push(
      `【财务摘要】每股收益 ${fmt(f.eps, ' 元')}｜营业总收入 ${fmt(f.revenueYi, ' 亿元')}${
        f.revenueYoy != null ? `（同比 ${f.revenueYoy >= 0 ? '+' : ''}${f.revenueYoy}%）` : ''
      }｜毛利率 ${fmt(f.grossMargin, '%')}｜净资产收益率 ${fmt(f.roe, '%')}｜市盈率(动态) ${fmt(f.peDynamic)}`
    );
  }
  if (parts.announcements && parts.announcements.length > 0) {
    sections.push(
      `【近期公告（官方）】\n${parts.announcements.map((item) => `- ${item.date} ${item.title}`).join('\n')}`
    );
  }
  if (parts.newsDigest) {
    sections.push(`【消息面参考】\n${parts.newsDigest}`);
  }
  sections.push(`【大盘环境】\n${renderOverviewSection(parts.overview ?? null)}`);
  return sections.join('\n\n');
}

// ---------- 提示词组装 ----------

export function buildRound1Prompt(briefText: string, subjectName: string, question?: string | null): string {
  return [
    `【会议任务】第一轮·独立分析。请基于以下数据简报，从你的流派出发，对「${subjectName}」给出独立判断。你还看不到其他专家的观点。`,
    question ? `【用户关注】${question}` : '【用户关注】无特别指定，请给出综合判断。',
    `——数据简报——\n${briefText}`
  ].join('\n');
}

export interface StanceDigest {
  expertName: string;
  school: string;
  direction: Stance['direction'];
  confidence: number;
  keyPoints: string;
  contentDigest: string;
}

export function buildDebatePrompt(
  briefText: string,
  subjectName: string,
  roundNo: number,
  stances: StanceDigest[],
  question?: string | null
): string {
  const stanceLines = stances
    .map(
      (s) =>
        `【${s.school}·${s.expertName}】${directionLabel(s.direction)}（置信度 ${s.confidence}）依据：${s.keyPoints}\n观点摘要：${s.contentDigest}`
    )
    .join('\n');
  return [
    `【会议任务】辩论轮（第 ${roundNo} 轮）。以下是同场专家的立场与观点：`,
    stanceLines,
    `请你就「${subjectName}」发言：用「@专家名」点名质疑至少一位与你意见相左的专家（要有数据依据），回应指向你的质疑，然后给出你修正后的最终判断。`,
    question ? `【用户关注】${question}` : '',
    `——数据简报（供引用）——\n${briefText}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildModeratorPrompt(
  subjectName: string,
  question: string | null | undefined,
  turns: Array<{ expertName: string; school: string; round: number; direction?: Stance['direction']; confidence?: number; content: string }>,
  convergence?: { rounds: number; stanceShift: number; converged: boolean }
): string {
  const turnLines = turns
    .map((turn) => {
      const stance =
        turn.direction
          ? `（${directionLabel(turn.direction)}${turn.confidence != null ? `，置信度 ${turn.confidence}` : ''}）`
          : '';
      return `【第 ${turn.round} 轮·${turn.school}·${turn.expertName}】${stance}\n${turn.content.slice(0, 600)}`;
    })
    .join('\n\n');
  const convergenceText = convergence
    ? `【辩论收敛情况】共进行 ${convergence.rounds} 轮辩论，最后一轮立场翻转 ${convergence.stanceShift} 人${
        convergence.converged ? '（已收敛：无人翻转立场，讨论达到相对平衡）' : '（未完全收敛：仍有立场摇摆，请你在裁决中重点回应）'
      }`
    : '';
  return [
    `【分析对象】${subjectName}`,
    question ? `【用户关注】${question}` : '',
    convergenceText,
    `【会议任务】请根据以下全部专家发言，产出最终会议纪要（按你被要求的格式输出，行使裁决权）。`,
    `——专家发言——\n${turnLines}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------- 本地规则兜底（无可用模型渠道时使用） ----------

export interface LocalAnalysis {
  content: string;
  stance: Stance;
}

/** 各专家的规则版独立分析：直接引用指标摘要数值，立场由流派评分决定。 */
export function localRound1(
  def: ExpertDefinition,
  summary: IndicatorSummary | null,
  snapshot?: QuoteSnapshot | null
): LocalAnalysis {
  // 板块降级简报（无 K 线指标）时：给出定性判断，立场中性。
  if (!summary) {
    const content = `当前分析对象为板块，K 线指标数据暂缺（数据源降级），${def.school}视角只能基于板块概况与成分股表现做定性判断：板块内部分化情况与领涨股结构是主要观察点。建议等待行情数据恢复后再做定量评估。`;
    return {
      content: `${content}\n【立场】中性\n【置信度】40\n【核心依据】板块K线暂缺，仅能定性判断（本地规则引擎）`,
      stance: { direction: 'neutral', confidence: 40, keyPoints: '板块K线暂缺，仅能定性判断（本地规则引擎）' }
    };
  }
  const signals = ruleSignalsOf(summary, snapshot);
  const key = (v: number | null | undefined, suffix = '') => fmt(v, suffix);

  const bodies: Record<string, string> = {
    'stock-trend': `从趋势结构看：MA5 ${key(summary.ma.ma5)}、MA10 ${key(summary.ma.ma10)}、MA20 ${key(summary.ma.ma20)}、MA60 ${key(summary.ma.ma60)}，均线${
      summary.maAlignment === 'bull' ? '呈多头排列，中期趋势向上' : summary.maAlignment === 'bear' ? '呈空头排列，中期趋势向下' : '相互纠缠，方向尚未选择'
    }。MACD 方面 DIF ${key(summary.macd.dif)} 对 DEA ${key(summary.macd.dea)}，${summary.macdCross === 'golden' ? `已于 ${summary.macdCrossAgo} 个交易日前形成金叉` : summary.macdCross === 'dead' ? `已于 ${summary.macdCrossAgo} 个交易日前形成死叉` : '暂无新鲜交叉信号'}。价格相对 MA20 乖离 ${key(summary.priceVsMa20, '%')}。${
      summary.maAlignment === 'bull'
        ? '趋势派的原则是顺势而为，只要 MA20 不破，回调都是正常节奏。'
        : summary.maAlignment === 'bear'
          ? '右侧交易者此时应保持观望，等趋势自己走出来。'
          : '方向未明之前，仓位就是态度。'
    }`,
    'stock-momentum': `短线动能：KDJ 的 K ${key(summary.kdj.k)}、D ${key(summary.kdj.d)}、J ${key(summary.kdj.j)}，${summary.kdjGolden ? '近 3 日内出现金叉，短线有反弹动能' : (summary.kdj.j ?? 50) > 100 ? 'J 值超买，短线追高风险大' : (summary.kdj.j ?? 50) < 0 ? 'J 值超卖，随时可能技术性反弹' : '摆动指标处于正常区间'}。RSI6 ${key(summary.rsi.rsi6)}、RSI12 ${key(summary.rsi.rsi12)}，${(summary.rsi.rsi6 ?? 50) > 80 ? '已到超买区，注意节奏' : (summary.rsi.rsi6 ?? 50) < 30 ? '进入超卖区，赔率开始合适' : '动量中性'}。近 5 日 ${key(summary.pct5d, '%')}、近 20 日 ${key(summary.pct20d, '%')}，短中期动能对比${(summary.pct5d ?? 0) > (summary.pct20d ?? 0) ? '偏强' : '偏弱'}。`,
    'stock-flow': `量价关系：今日 ${summary.volume.today} 手，5 日均量 ${summary.volume.avg5} 手，量比 ${key(summary.volume.ratio)}，${
      (summary.volume.ratio ?? 1) > 1.5
        ? (summary.pct1d ?? 0) >= 0 ? '放量上涨，有资金主动进场' : '放量下跌，抛压沉重，疑似资金出逃'
        : (summary.volume.ratio ?? 1) < 0.7
          ? '明显缩量，观望情绪浓，无量价格不可信'
          : '量能平稳'
    }。OBV 五日趋势${{ up: '向上，量能配合价格', down: '向下，量能背离价格', flat: '走平，资金按兵不动' }[summary.volume.obvTrend]}。换手 ${key(snapshot?.turnover, '%')}${(snapshot?.turnover ?? 0) > 15 ? '，交投过热，警惕对倒出货' : ''}。量在价先，先看量再信价。`,
    'stock-value': `估值与位置：PE(TTM) ${key(snapshot?.pe)}、PB ${key(snapshot?.pb)}、总市值 ${key(snapshot?.totalMarketCap, '亿')}，${
      (snapshot?.pe ?? 0) > 0 && (snapshot?.pe ?? 0) < 15 ? '估值水位不高，具备一定安全边际' : (snapshot?.pe ?? 0) > 60 ? '估值明显偏贵，价格里挤满了情绪' : '估值中规中矩'
    }。价格当前位于区间 ${summary.range.position}% 分位（区间高 ${key(summary.range.high)} / 低 ${key(summary.range.low)}），${
      summary.range.position < 20 ? '位置偏低，向下空间有限' : summary.range.position > 90 ? '位置偏高，追高的性价比很差' : '位置中等'
    }。ATR 占价 ${key(summary.atrPct, '%')}，波动${(summary.atrPct ?? 0) > 4 ? '剧烈' : '温和'}。短期是投票机，长期是称重机，我不为情绪付溢价。`,
    'stock-risk': `风险清单：其一，价格位于区间 ${summary.range.position}% 分位${summary.range.position > 85 ? '，接近区间高点，追高一旦不及预期，回撤空间大' : ''}；其二，ATR 占价 ${key(summary.atrPct, '%')}，${(summary.atrPct ?? 0) > 3.5 ? '日内波动剧烈，止损纪律必须先于仓位存在' : '波动尚可控制'}；其三，量比 ${key(summary.volume.ratio)}${(summary.volume.ratio ?? 1) > 1.8 ? '，放巨量行情，多空分歧极大，谨防高位的最后一棒' : ''}。三情景推演：乐观情景延续当前动能；中性情景震荡消化；悲观情景跌破 MA20 ${key(summary.ma.ma20)} 后趋势反转。请所有人回答同一个问题：如果结论错了，你的止损位在哪里？`
  };

  const scoreMap: Record<string, number> = {
    'stock-trend': signals.trendScore,
    'stock-momentum': signals.momentumScore,
    'stock-flow': signals.flowScore,
    'stock-value': signals.valueScore,
    // 风控专家天生站在多数人对面：取其余四方平均分的反向。
    'stock-risk': -Math.round(((signals.trendScore + signals.momentumScore + signals.flowScore + signals.valueScore) / 4) * 2) / 2
  };
  const raw = scoreMap[def.code] ?? 0;
  const { direction, confidence } = scoreToStance(raw);
  const keyPoints = `${def.school}信号评分 ${raw > 0 ? '+' : ''}${raw}：${{
    bull: '指标信号偏多',
    bear: '指标信号偏空',
    neutral: '信号方向不明'
  }[direction]}（本地规则引擎）`;

  return {
    content: `${bodies[def.code] ?? '数据不足，暂无法给出判断。'}\n【立场】${directionLabel(direction)}\n【置信度】${Math.round(confidence)}\n【核心依据】${keyPoints}`,
    stance: { direction, confidence: Math.round(confidence), keyPoints }
  };
}

/** 本地规则版主席纪要：由立场统计直接生成。 */
export function localModeratorReport(
  subjectName: string,
  stances: Array<{ expertName: string; school: string; stance: Stance }>,
  question?: string | null
): string {
  const bull = stances.filter((s) => s.stance.direction === 'bull');
  const bear = stances.filter((s) => s.stance.direction === 'bear');
  const neutral = stances.filter((s) => s.stance.direction === 'neutral');
  const avgConfidence = Math.round(
    stances.reduce((sum, s) => sum + s.stance.confidence, 0) / Math.max(1, stances.length)
  );
  let conclusion: ConclusionDirection;
  if (bull.length - bear.length >= 2) {
    conclusion = 'bull';
  } else if (bear.length - bull.length >= 2) {
    conclusion = 'bear';
  } else {
    conclusion = 'watch';
  }
  const conclusionLabel = { bull: '看多', bear: '看空', neutral: '中性', watch: '观望' }[conclusion];
  const lines = stances.map((s) => `${s.school}·${s.expertName}：${directionLabel(s.stance.direction)}（置信度 ${s.stance.confidence}）——${s.stance.keyPoints}`);
  return [
    `## 会议结论`,
    `本次会议针对「${subjectName}」${question ? `（用户关注：${question}）` : ''}由五位专家基于同一份数据简报独立分析。因当前模型渠道不可用，本纪要由规则引擎根据各专家指标评分生成，仅供参考。`,
    `【结论】${conclusionLabel}`,
    `## 多空投票`,
    `${bull.length} 看多 / ${bear.length} 看空 / ${neutral.length} 中性，平均置信度 ${avgConfidence}`,
    `## 各专家立场`,
    ...lines,
    `## 风险提示`,
    `本报告由公开行情与规则信号自动生成，不构成任何投资建议；市场有风险，入市需谨慎。`
  ].join('\n');
}

function ruleSignalsOf(summary: IndicatorSummary, snapshot?: QuoteSnapshot | null): RuleSignals {
  return computeRuleSignals(summary, {
    pe: snapshot?.pe ?? null,
    pb: snapshot?.pb ?? null,
    turnover: snapshot?.turnover ?? null
  });
}

export const DISCLAIMER =
  '免责声明：本报告由 AI 多智能体基于公开行情数据生成，仅供学习研究参考，不构成任何投资建议；市场有风险，投资需谨慎。';
