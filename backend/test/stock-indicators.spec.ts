// 股市圆桌单元测试：技术指标、行情解析器、立场解析与本地兜底（不依赖网络与 Nest 容器）。
import {
  KlineItem,
  computeIndicatorSeries,
  kdj,
  macd,
  rsi,
  scoreToStance,
  sma,
  summarizeIndicators,
  computeRuleSignals
} from '../src/modules/stock/indicators.util';
import { DISCLAIMER, parseConclusion, parseStance, computeDebateConvergence } from '../src/modules/stock/experts.definitions';
import { parseSinaSectorList, parseSinaConstituents, isSinaSectorCode, isEastmoneySectorCode } from '../src/modules/stock/market/sina-sector.api';
import { parseCninfoOrg, parseCninfoAnnouncements } from '../src/modules/stock/market/cninfo.api';
import { parseThsFinancials } from '../src/modules/stock/market/ths-f10.api';
import {
  parseTencentQuotes as parseTencent,
  parseSinaQuotes,
  parseTencentKline,
  parseSinaKline,
  buildSinaQuoteUrl,
  normalizeSymbol
} from '../src/modules/stock/market/tencent-quote.api';
import { parseEastmoneyKline, parseEastmoneySectors, parseEastmoneySuggest, secidFor } from '../src/modules/stock/market/eastmoney.api';

// 生成一段确定性走势的 K 线：先跌后升（百分比动量，保证末端 MACD 结构稳定偏多）。
function fixtureKlines(count = 120): KlineItem[] {
  const items: KlineItem[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    // 前 40 日阴跌，后 80 日上行。
    const driftPct = i < 40 ? -0.005 : 0.008;
    const wobblePct = Math.sin(i / 5) * 0.0015;
    const close = Math.round(price * (1 + driftPct + wobblePct) * 100) / 100;
    const open = price;
    items.push({
      date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      open,
      close,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      volume: 10000 + (i % 7) * 800 + (i > 40 ? 3000 : 0),
      amount: close * 10000,
      pct: ((close - open) / open) * 100
    });
    price = close;
  }
  return items;
}

describe('stock indicators', () => {
  it('sma computes rolling mean with null warmup', () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result).toEqual([null, null, 2, 3, 4]);
  });

  it('macd detects golden cross on rising series', () => {
    const closes = fixtureKlines(120).map((k) => k.close);
    const result = macd(closes);
    const lastDif = result.dif[result.dif.length - 1] as number;
    const lastDea = result.dea[result.dea.length - 1] as number;
    expect(lastDif).toBeGreaterThan(lastDea);
    expect(lastDif).toBeGreaterThan(0);
  });

  it('kdj stays within reasonable bounds', () => {
    const klines = fixtureKlines(60);
    const result = kdj(
      klines.map((k) => k.high),
      klines.map((k) => k.low),
      klines.map((k) => k.close)
    );
    const tail = result.k.slice(-20).filter((v): v is number => v != null);
    expect(tail.length).toBe(20);
    tail.forEach((k) => {
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(100);
    });
  });

  it('rsi is between 0 and 100 and high on strong uptrend', () => {
    const closes = fixtureKlines(120).map((k) => k.close);
    const result = rsi(closes, 6);
    const tail = result.slice(-10).filter((v): v is number => v != null);
    tail.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
    expect(tail[tail.length - 1]).toBeGreaterThan(50);
  });

  it('summary detects bull alignment and positive short-term pct on uptrend fixture', () => {
    const summary = summarizeIndicators(fixtureKlines(150));
    expect(summary).not.toBeNull();
    expect(summary!.maAlignment).toBe('bull');
    expect(summary!.pct5d).toBeGreaterThan(0);
    expect(summary!.recent).toHaveLength(10);
    expect(summary!.range.position).toBeGreaterThan(80);
  });

  it('rule signals lean bullish on uptrend fixture', () => {
    const summary = summarizeIndicators(fixtureKlines(150))!;
    const signals = computeRuleSignals(summary, { pe: 25, pb: 3, turnover: 2 });
    expect(signals.trendScore).toBeGreaterThan(0);
    expect(scoreToStance(signals.trendScore).direction).toBe('bull');
  });

  it('computeIndicatorSeries exposes chart-ready arrays', () => {
    const pack = computeIndicatorSeries(fixtureKlines(100));
    expect(pack.ma5).toHaveLength(100);
    expect(pack.boll.upper[99]).not.toBeNull();
    expect((pack.boll.upper[99] as number)!).toBeGreaterThan((pack.boll.lower[99] as number)!);
    expect(pack.volumeRatio).not.toBeNull();
  });
});

describe('stock parsers', () => {
  it('parses tencent quote with verified field layout', () => {
    // 2026-10-23 实抓原始串（含完整买卖五档，字段位置不可删改）。
    const raw =
      'v_sh600519="1~贵州茅台~600519~1335.00~1318.49~1311.84~57686~31159~26527~1333.00~6~1331.00~2~1330.00~2~1329.50~3~1329.02~1~1335.00~116~1335.01~2~1335.14~2~1335.19~1~1335.20~1~~20261023161458~16.51~1.25~1343.88~1310.00~1335.00/57686/7677216283~57686~767722~0.46~20.49~~1343.88~1310.00~2.57~16688.59~16688.59~6.64~1450.34~1186.64~1.53~-108~1330.86~18.74~20.27~~~0.02~767721.6283~120.1500~9~   A~GP-A~-1.05~0.45~3.90~32.41~27.30~1539.98~1151.01~5.70~5.37~3.33~1250081601~1250081601~-79.41~0.90~1250081601~~~-5.72~0.57~~CNY~0~___D__F__N~1335.41~-44~";';
    const snapshots = parseTencent(raw);
    expect(snapshots).toHaveLength(1);
    const snap = snapshots[0];
    expect(snap.symbol).toBe('sh600519');
    expect(snap.name).toBe('贵州茅台');
    expect(snap.price).toBeCloseTo(1335.0);
    expect(snap.prevClose).toBeCloseTo(1318.49);
    expect(snap.changePct).toBeCloseTo(1.25);
    expect(snap.pe).toBeCloseTo(20.49);
    expect(snap.pb).toBeCloseTo(6.64);
    expect(snap.totalMarketCap).toBeCloseTo(16688.59);
  });

  it('parses sina backup quote', () => {
    // 2026-10-23 实抓原始串（含完整五档报价字段，共 33 列）。
    const raw =
      'var hq_str_sh600519="贵州茅台,1311.840,1318.490,1335.000,1343.880,1310.000,1333.000,1335.000,5768593,7677216283.000,600,1333.000,200,1331.000,200,1330.000,300,1329.500,100,1329.020,11600,1335.000,200,1335.010,200,1335.140,100,1335.190,100,1335.200,2026-10-23,15:34:59,00,D|900|1201500.00";';
    const snapshots = parseSinaQuotes(raw);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].price).toBeCloseTo(1335);
    expect(snapshots[0].prevClose).toBeCloseTo(1318.49);
    expect(snapshots[0].volume).toBeCloseTo(57685.93, 0);
  });

  it('parses eastmoney kline csv', () => {
    const payload = {
      data: {
        name: '贵州茅台',
        klines: [
          '2026-10-22,1303.21,1318.49,1322.00,1296.00,42491,5576216948.00,1.99,0.67,8.80,0.34',
          '2026-10-23,1311.84,1335.00,1343.88,1310.00,57686,7677216283.00,2.57,1.25,16.51,0.46'
        ]
      }
    };
    const parsed = parseEastmoneyKline(payload);
    expect(parsed.name).toBe('贵州茅台');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[1].close).toBe(1335);
    expect(parsed.items[1].turnover).toBeCloseTo(0.46);
  });

  it('parses eastmoney sectors and suggest', () => {
    const sectorPayload = {
      data: {
        total: 2,
        diff: [{ f3: 7.98, f12: 'BK1408', f14: '机器人', f104: 22, f105: 0, f128: '派斯林', f140: '600215', f136: 10.07 }]
      }
    };
    const sectors = parseEastmoneySectors(sectorPayload);
    expect(sectors.items[0].name).toBe('机器人');
    expect(sectors.items[0].pct).toBeCloseTo(7.98);
    expect(sectors.items[0].upCount).toBe(22);

    const suggestPayload = {
      QuotationCodeTable: {
        Data: [
          { Code: '600519', Name: '贵州茅台', MktNum: '1', Classify: 'AStock' },
          { Code: '000001', Name: '上证指数', MktNum: '1', Classify: 'Index' },
          { Code: '161005', Name: '富国天惠', MktNum: '1', Classify: 'Fund' }
        ]
      }
    };
    const items = parseEastmoneySuggest(suggestPayload);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ symbol: 'sh600519', type: 'stock' });
    expect(items[1]).toMatchObject({ symbol: 'sh000001', type: 'index' });
  });

  it('secid mapping and symbol normalization', () => {
    expect(secidFor('sh600519')).toBe('1.600519');
    expect(secidFor('sz399001')).toBe('0.399001');
    expect(secidFor('bk0475')).toBe('90.BK0475');
    expect(normalizeSymbol('600519')).toBe('sh600519');
    expect(normalizeSymbol('000001')).toBe('sz000001');
  });

  it('parses tencent and sina backup klines', () => {
    const tencentPayload = {
      code: 0,
      data: {
        sh600519: {
          qfqday: [
            ['2026-10-22', '1303.210', '1318.490', '1322.000', '1296.000', '42491.000'],
            ['2026-10-23', '1311.840', '1335.000', '1343.880', '1310.000', '57686.000']
          ]
        }
      }
    };
    const tencent = parseTencentKline(tencentPayload, 250);
    expect(tencent.items).toHaveLength(2);
    expect(tencent.items[1].close).toBe(1335);
    expect(tencent.items[1].volume).toBeCloseTo(57686);
    expect(tencent.items[1].pct).toBeCloseTo(1.25, 1);

    const sinaRaw =
      'var _= ([{"day":"2026-10-22","open":"1303.210","high":"1322.000","low":"1296.000","close":"1318.490","volume":"4249100"},' +
      '{"day":"2026-10-23","open":"1311.840","high":"1343.880","low":"1310.000","close":"1335.000","volume":"5768600"}]);';
    const sina = parseSinaKline(sinaRaw, 250);
    expect(sina.items).toHaveLength(2);
    expect(sina.items[1].close).toBe(1335);
    expect(sina.items[1].volume).toBeCloseTo(57686);
    expect(sina.items[1].pct).toBeCloseTo(1.25, 1);
  });
});

describe('stock expert definitions', () => {
  it('parses stance tag lines', () => {
    const stance = parseStance('正文……\n【立场】看多\n【置信度】75\n【核心依据】均线多头叠加放量');
    expect(stance).toEqual({
      direction: 'bull',
      confidence: 75,
      keyPoints: '均线多头叠加放量'
    });
  });

  it('returns null stance without tag and clamps confidence', () => {
    expect(parseStance('没有标签的输出')).toBeNull();
    const stance = parseStance('【立场】看空\n【置信度】250');
    expect(stance?.confidence).toBe(100);
  });

  it('falls back to semantic stance when model omits tags', () => {
    // 二级：结论行关键词（GPT-6.1 实测输出风格）。
    const bull = parseStance('正文若干分析。\n\n最终判断：短线偏多，尚未确认中期上升趋势，不宜追涨重仓。');
    expect(bull?.direction).toBe('bull');
    expect(bull?.confidence).toBeLessThanOrEqual(50);

    const bear = parseStance('分析内容。\n综合判断：整体偏空，建议回避等待破位确认。');
    expect(bear?.direction).toBe('bear');

    // 二级平局（GPT-6.1 真实输出：下跌与反弹措辞打平）→ 中性。
    const tied = parseStance('**独立判断：下跌趋势中的强反弹，方向尚未反转。**\n\n宁德时代现价 237.60 元。');
    expect(tied?.direction).toBe('neutral');

    // 三级：仅结尾措辞倾向。
    const tailOnly = parseStance('一段纯文本分析，其中提到回调风险与止损纪律，空方动能占优。');
    expect(['bear', null]).toContain(tailOnly?.direction ?? null);

    // 完全无倾向 → null。
    expect(parseStance('这是一段没有任何方向词的 neutral 文本。')).toBeNull();
  });

  it('parses moderator conclusion', () => {
    expect(parseConclusion('## 会议结论\n判断如下\n【结论】观望')).toBe('watch');
    expect(parseConclusion('没有结论标签')).toBeNull();
  });

  it('detects debate convergence by stance flips', () => {
    const stanceOf = (direction: 'bull' | 'bear' | 'neutral', confidence = 60) => ({ direction, confidence, keyPoints: '' });
    const turns = [
      // 第一轮：趋势多 / 动量空 / 量价多。
      { expertCode: 'stock-trend', round: 1, ok: true, stance: stanceOf('bull') },
      { expertCode: 'stock-momentum', round: 1, ok: true, stance: stanceOf('bear') },
      { expertCode: 'stock-flow', round: 1, ok: true, stance: stanceOf('bull') },
      // 第二轮：动量被说服翻多，其余维持。
      { expertCode: 'stock-trend', round: 2, ok: true, stance: stanceOf('bull') },
      { expertCode: 'stock-momentum', round: 2, ok: true, stance: stanceOf('bull') },
      { expertCode: 'stock-flow', round: 2, ok: true, stance: stanceOf('bull') }
    ];
    // 第二轮后：动量翻转 1 人 → 未收敛。
    const after2 = computeDebateConvergence(turns, 2);
    expect(after2.stanceShift).toBe(1);
    expect(after2.flipped).toEqual(['stock-momentum']);
    expect(after2.converged).toBe(false);

    // 第三轮：无人再翻转 → 收敛（相对平衡点）。
    const withRound3 = [
      ...turns,
      { expertCode: 'stock-trend', round: 3, ok: true, stance: stanceOf('bull') },
      { expertCode: 'stock-momentum', round: 3, ok: true, stance: stanceOf('bull') },
      { expertCode: 'stock-flow', round: 3, ok: true, stance: stanceOf('bull') }
    ];
    const after3 = computeDebateConvergence(withRound3, 3);
    expect(after3.stanceShift).toBe(0);
    expect(after3.converged).toBe(true);

    // 某专家第二轮失败（无立场）不参与比较，不误判。
    const partial = [
      ...turns,
      { expertCode: 'stock-trend', round: 3, ok: true, stance: stanceOf('bull') },
      { expertCode: 'stock-flow', round: 3, ok: true, stance: stanceOf('bull') }
    ];
    expect(computeDebateConvergence(partial, 3).converged).toBe(true);
  });

  it('local round1 generates content with stance tags', async () => {
    const { EXPERT_DEFINITIONS, localRound1, localModeratorReport } = await import(
      '../src/modules/stock/experts.definitions'
    );
    const summary = summarizeIndicators(fixtureKlines(150))!;
    for (const def of EXPERT_DEFINITIONS) {
      const local = localRound1(def, summary, { pe: 20, pb: 3, turnover: 1 } as never);
      expect(local.content).toContain('【立场】');
      expect(local.content).toContain('【置信度】');
      expect(['bull', 'bear', 'neutral']).toContain(local.stance.direction);
    }
    const report = localModeratorReport(
      '测试对象',
      EXPERT_DEFINITIONS.map((def) => ({
        expertName: def.name,
        school: def.school,
        stance: localRound1(def, summary, null).stance
      }))
    );
    expect(report).toContain('【结论】');
    expect(report).toContain('不构成任何投资建议');
    expect(DISCLAIMER).toContain('不构成任何投资建议');
  });

  it('buildSinaQuoteUrl joins symbols', () => {
    expect(buildSinaQuoteUrl(['sh600519', 'sz000001'])).toContain('list=sh600519,sz000001');
  });

  it('parses cninfo announcements and org lookup', () => {
    const orgs = [
      { code: '600519', orgId: 'gssh0600519', zwjc: '贵州茅台' },
      { code: '000858', orgId: 'gssz0000858', zwjc: '五粮液' },
      { code: '300750', orgId: 'gssz0300750', zwjc: '宁德时代' }
    ];
    expect(parseCninfoOrg(orgs, '600519')).toEqual({ orgId: 'gssh0600519', column: 'sse' });
    expect(parseCninfoOrg(orgs, '000858')?.column).toBe('szse');
    expect(parseCninfoOrg(orgs, '300750')?.column).toBe('szse');
    expect(parseCninfoOrg(orgs, '999999')).toBeNull();

    const rows = [
      { announcementTitle: '贵州茅台<em>2026年</em>半年度报告', announcementTime: 1792838400000 },
      { announcementTitle: '关于会计政策变更的公告', announcementTime: 1792752000000 },
      { announcementTitle: '', announcementTime: 1792665600000 }
    ];
    const items = parseCninfoAnnouncements(rows, 8);
    expect(items).toHaveLength(2);
    expect(items[0].title).not.toContain('<em>');
    expect(items[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 时间倒序：第一条时间戳更晚。
    expect(items[0].date >= items[1].date).toBe(true);
  });

  it('parses ths f10 financial fields from real page snippet', () => {
    // 2026-10 实抓 F10 主页片段：字段名与数值间隔含数字的标签属性（data-url 哈希），
    // 解析必须先剥标签；补齐长度护栏。
    const html =
      '<html><body>'.padEnd(1000, ' ') +
      [
        "<a data-url='http://www.iwencai.com/yike/detail/auid/e8047e835e78ef8f' content='税后利润除以股本总数'>每股收益：</a></td><td>35.57元",
        "<span title='动态市盈率'>市盈率(动态)：</span></td><td>18.744",
        '营业总收入：</td><td>922.78亿元 同比增长1.3%',
        '毛利率：</td><td>89.56%',
        '净资产收益率：</td><td>16.75%'
      ].join('');
    const f = parseThsFinancials(html);
    expect(f).not.toBeNull();
    expect(f!.eps).toBeCloseTo(35.57);
    expect(f!.peDynamic).toBeCloseTo(18.744);
    expect(f!.revenueYi).toBeCloseTo(922.78);
    expect(f!.revenueYoy).toBeCloseTo(1.3);
    expect(f!.grossMargin).toBeCloseTo(89.56);
    expect(f!.roe).toBeCloseTo(16.75);

    expect(parseThsFinancials('<html></html>')).toBeNull();
    expect(parseThsFinancials('')).toBeNull();
  });

  it('renders announcement/financial/news sections in brief', async () => {
    const { renderBriefText } = await import('../src/modules/stock/experts.definitions');
    const brief = renderBriefText({
      subjectName: '贵州茅台',
      subjectType: 'stock',
      dateText: '2026-10-25',
      announcements: [{ title: '2026年半年度报告', date: '2026-10-20' }],
      financials: { eps: 35.57, revenueYi: 922.78, revenueYoy: 1.3, grossMargin: 89.56, roe: 16.75, peDynamic: 18.74 },
      newsDigest: '（模型既有知识，可能不含最新动态）……'
    });
    expect(brief).toContain('【财务摘要】');
    expect(brief).toContain('35.57 元');
    expect(brief).toContain('同比 +1.3%');
    expect(brief).toContain('【近期公告（官方）】');
    expect(brief).toContain('2026-10-20 2026年半年度报告');
    expect(brief).toContain('【消息面参考】');
  });

  it('parses sina sector list and constituents', () => {
    const raw =
      'var S_Finance_bankuai_sinaindustry = {"new_blhy":"new_blhy,玻璃行业,19,14.778947368421,0.15368421052632,1.0508133007053,884613615,11280112441,sz300093,4.236,18.700,0.760,金刚光伏","new_cbzz":"new_cbzz,船舶制造,8,13.88,0.23,1.69,287364581,4767158159,sz3001xx,2.5,7.6,0.2,某船舶"}';
    const list = parseSinaSectorList(raw);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ code: 'new_blhy', name: '玻璃行业' });
    expect(list[1].name).toBe('船舶制造');

    const constituents = parseSinaConstituents([
      {
        symbol: 'sz300093',
        code: '300093',
        name: '金刚光伏',
        trade: '18.700',
        changepercent: 4.236,
        volume: 6976901,
        amount: 124297314,
        turnoverratio: 2.50068,
        per: 22.262,
        pb: 5.396
      }
    ]);
    expect(constituents).toHaveLength(1);
    expect(constituents[0]).toMatchObject({ symbol: 'sz300093', name: '金刚光伏', changePct: 4.236, turnover: 2.50068 });

    expect(isSinaSectorCode('new_blhy')).toBe(true);
    expect(isSinaSectorCode('BK0475')).toBe(false);
    expect(isEastmoneySectorCode('BK0475')).toBe(true);
    expect(isEastmoneySectorCode('new_blhy')).toBe(false);
  });
});
