// 日线行情库续抓校准纯函数单测（不依赖网络与 Nest 容器，照 compliance-scan.util.spec.ts 头部范式）：
// toUtcMidnight 严格归一 / isoDay 往返 / computeFetchLimit 双锚扩窗 / splitBarsForUpsert 全窗口写+重叠切割 /
// computeAdjustDrift 中位数漂移 / klineToRow 二次防线。
import {
  BARS_TO_CALENDAR_FACTOR,
  barsToCalendarDays,
  computeAdjustDrift,
  computeFetchLimit,
  isoDay,
  klineToRow,
  splitBarsForUpsert,
  toUtcMidnight,
  BarRowDraft
} from '../src/modules/stock/daily-bars/daily-bars-calib.util';
import { KlineItem } from '../src/modules/stock/indicators.util';

const draft = (date: string, close: number, symbol = 'sh600519'): BarRowDraft => ({
  symbol,
  date,
  tradeDate: new Date(`${date}T00:00:00.000Z`),
  open: close * 0.99,
  high: close * 1.02,
  low: close * 0.98,
  close,
  volume: 100,
  amount: close * 10000
});

const klineItem = (overrides: Partial<KlineItem>): KlineItem => ({
  date: '2026-09-01',
  open: 10,
  close: 10.4,
  high: 10.8,
  low: 9.9,
  volume: 100,
  amount: 1040,
  ...overrides
});

// 固定「今天」（computeFetchLimit 内部只取 UTC 日历日，时钟部分无关）
const TODAY = new Date('2026-11-04T10:30:00.000Z');

describe('toUtcMidnight（严格 UTC 零点归一）', () => {
  it('①正常归一：getUTC* 全部为零点字段', () => {
    const d = toUtcMidnight('2026-09-01');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
    expect(d!.getUTCMonth()).toBe(8); // 0-based：九月=8
    expect(d!.getUTCDate()).toBe(1);
    expect(d!.getUTCHours()).toBe(0);
    expect(d!.getUTCMinutes()).toBe(0);
    expect(d!.getUTCSeconds()).toBe(0);
    expect(d!.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('②非法串返回 null（空/垃圾/带时间部分）', () => {
    expect(toUtcMidnight('')).toBeNull();
    expect(toUtcMidnight('garbage')).toBeNull();
    expect(toUtcMidnight('2026-09-01T10:00:00Z')).toBeNull();
  });

  it("③'2026-2-3' 补零缺失拒绝（宽松解析会静默错位）", () => {
    expect(toUtcMidnight('2026-2-3')).toBeNull();
  });

  it('④越界日期（2026-02-30）拒绝：Date 静默滚动陷阱', () => {
    expect(toUtcMidnight('2026-02-30')).toBeNull();
  });
});

describe('isoDay（Date → UTC YYYY-MM-DD）', () => {
  it('⑤与 toUtcMidnight 往返恒等（连续日期样本）', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-12-31', '2026-09-01']) {
      expect(isoDay(toUtcMidnight(iso)!)).toBe(iso);
    }
  });

  it('⑥跨月/跨年边界用 UTC 字段（不受本地时区影响）', () => {
    expect(isoDay(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe('2026-12-31');
    expect(isoDay(new Date(Date.UTC(2027, 0, 1, 0, 0)))).toBe('2027-01-01');
  });
});

describe('computeFetchLimit（断点续抓双锚扩窗）', () => {
  const INIT = 250;
  const MAX = 250;
  const BUFFER = 5;

  it('⑦首抓（无任何锚点）= initBars', () => {
    expect(computeFetchLimit(null, null, TODAY, INIT, MAX, BUFFER)).toBe(250);
  });

  it('⑧续抓 1 天：窗口=1+buffer（buffer 兜底）', () => {
    expect(computeFetchLimit('2026-11-03', null, TODAY, INIT, MAX, BUFFER)).toBe(6);
  });

  it('⑨春节 10 天跨度：窗口=10+buffer', () => {
    // 2026-02-10 → 2026-02-20 恰 10 个日历天
    expect(computeFetchLimit('2026-02-10', null, new Date('2026-02-20T08:00:00.000Z'), INIT, MAX, BUFFER)).toBe(15);
  });

  it('⑩中段缺口锚点早于 latest：窗口按缺口扩（更早者生效）', () => {
    // latest 昨天，但缺口锚点 2026-10-01 → 以缺口扩窗
    const span = Math.floor((Date.UTC(2026, 10, 4) - Date.UTC(2026, 9, 1)) / 86400000); // 34
    expect(computeFetchLimit('2026-11-03', '2026-10-01', TODAY, INIT, MAX, BUFFER)).toBe(span + BUFFER);
  });

  it('⑪缺口锚点晚于 latest：仍取更早的 latest（缺口锚只扩不缩）', () => {
    // latest 2026-10-01 比 gap 锚 2026-11-01 更早 → 锚=latest
    const span = Math.floor((Date.UTC(2026, 10, 4) - Date.UTC(2026, 9, 1)) / 86400000); // 34
    expect(computeFetchLimit('2026-10-01', '2026-11-01', TODAY, INIT, MAX, BUFFER)).toBe(span + BUFFER);
  });

  it('⑫超 maxBars clamp：停机数年也只拉 maxBars', () => {
    expect(computeFetchLimit('2020-01-01', null, TODAY, INIT, MAX, BUFFER)).toBe(250);
  });

  it('⑬今天≤锚点（时钟回拨/未来锚）防御返回 buffer', () => {
    expect(computeFetchLimit('2026-11-05', null, TODAY, INIT, MAX, BUFFER)).toBe(5);
    expect(computeFetchLimit('2026-11-04', null, TODAY, INIT, MAX, BUFFER)).toBe(5);
  });

  it('⑭锚点非法串（防御）回落 initBars', () => {
    expect(computeFetchLimit('bad-date', null, TODAY, INIT, MAX, BUFFER)).toBe(250);
  });
});

describe('barsToCalendarDays（根数→日历天保守换算，评审意见 3 单位对齐）', () => {
  it('㉛250 根 → 350 日历天（周末 5/7 倒数 1.4），方向保守：换算值 ≤ 真实回看跨度', () => {
    expect(BARS_TO_CALENDAR_FACTOR).toBe(1.4);
    expect(barsToCalendarDays(250)).toBe(350);
  });

  it('㉜向上取整且非负：10 根 → 14 天，1 根 → 2 天，0 根 → 0 天', () => {
    expect(barsToCalendarDays(10)).toBe(14);
    expect(barsToCalendarDays(1)).toBe(2);
    expect(barsToCalendarDays(0)).toBe(0);
  });
});

describe('splitBarsForUpsert（全窗口写 + 漂移重叠切割）', () => {
  const d1 = '2026-09-01';
  const d2 = '2026-09-02';
  const d3 = '2026-09-03';
  const d5 = '2026-09-05';
  const d7 = '2026-09-07';

  it('⑮空库存：全量进 upserts，overlapFetched 空', () => {
    const items = [draft(d1, 10), draft(d2, 10.1)];
    const { upserts, overlapFetched } = splitBarsForUpsert(items, null, 30);
    expect(upserts.map((r) => r.date)).toEqual([d1, d2]);
    expect(overlapFetched).toEqual([]);
  });

  it('⑯中段缺口行进 upserts（防回归：唯一键幂等回填历史缺口）', () => {
    // 拉回 d1/d3/d5（d2、d4 缺），latest 存量停在 d5 之后 → 三行全写
    const items = [draft(d1, 10), draft(d3, 10.2), draft(d5, 10.4)];
    const { upserts } = splitBarsForUpsert(items, d5, 30);
    expect(upserts.map((r) => r.date)).toEqual([d1, d3, d5]);
  });

  it('⑰最新一根在 upserts（重写修正收盘结算）', () => {
    const items = [draft(d1, 10), draft(d7, 11)];
    const { upserts } = splitBarsForUpsert(items, d7, 30);
    expect(upserts.some((r) => r.date === d7)).toBe(true);
  });

  it('⑱overlap 切割：latestStored 之前最近 overlapBars 根，且不含待写最新根', () => {
    const items = [draft(d1, 10), draft(d2, 10.1), draft(d3, 10.2), draft(d5, 10.4), draft(d7, 11)];
    const { upserts, overlapFetched } = splitBarsForUpsert(items, d7, 3);
    expect(upserts).toHaveLength(5);
    expect(overlapFetched.map((r) => r.date)).toEqual([d2, d3, d5]); // d7 是最新根不入 overlap
    expect(overlapFetched.every((r) => r.date < d7)).toBe(true);
  });

  it('⑲overlap 不足 overlapBars 时给全部前序行', () => {
    const items = [draft(d1, 10), draft(d2, 10.1), draft(d7, 11)];
    const { overlapFetched } = splitBarsForUpsert(items, d7, 30);
    expect(overlapFetched.map((r) => r.date)).toEqual([d1, d2]);
  });

  it('⑳乱序输入先排序再切（同日重复取后到者）', () => {
    const items = [draft(d5, 10.4), draft(d1, 10), draft(d3, 10.19), draft(d3, 10.2), draft(d2, 10.1)];
    const { upserts, overlapFetched } = splitBarsForUpsert(items, d5, 2);
    expect(upserts.map((r) => r.date)).toEqual([d1, d2, d3, d5]);
    expect(upserts.find((r) => r.date === d3)!.close).toBe(10.2); // 同日后者覆盖
    expect(overlapFetched.map((r) => r.date)).toEqual([d2, d3]);
  });
});

describe('computeAdjustDrift（重叠段前复权漂移校准）', () => {
  it('㉑无漂移：factor≈1，drifted false', () => {
    const stored = [
      { date: '2026-09-01', close: 10 },
      { date: '2026-09-02', close: 10.2 }
    ];
    const result = computeAdjustDrift(stored, stored, 1);
    expect(result.drifted).toBe(false);
    expect(result.factor).toBeCloseTo(1, 10);
  });

  it('㉒除权 fixture（×0.77）：factor≈0.77，drifted true', () => {
    const stored = [
      { date: '2026-09-01', close: 10 },
      { date: '2026-09-02', close: 10.2 },
      { date: '2026-09-03', close: 10.4 }
    ];
    const fetched = stored.map((row) => ({ date: row.date, close: row.close * 0.77 }));
    const result = computeAdjustDrift(stored, fetched, 1);
    expect(result.drifted).toBe(true);
    expect(result.factor).toBeCloseTo(0.77, 6);
  });

  it('㉓重叠空 → { drifted:false, factor:null }（首抓无漂移概念）', () => {
    expect(computeAdjustDrift([], [], 1)).toEqual({ drifted: false, factor: null });
  });

  it('㉒b 日期不配对：未配对行不参与中位数', () => {
    const stored = [
      { date: '2026-09-01', close: 10 },
      { date: '2026-09-02', close: 10.2 }
    ];
    const fetched = [{ date: '2026-09-09', close: 5 }];
    expect(computeAdjustDrift(stored, fetched, 1)).toEqual({ drifted: false, factor: null });
  });

  it('㉔NaN/非正收盘脏值剔除，剩余配对仍判漂移', () => {
    const stored = [
      { date: '2026-09-01', close: Number.NaN },
      { date: '2026-09-02', close: 0 },
      { date: '2026-09-03', close: 10 }
    ];
    const fetched = [
      { date: '2026-09-01', close: 5 },
      { date: '2026-09-02', close: 5 },
      { date: '2026-09-03', close: 5 }
    ];
    const result = computeAdjustDrift(stored, fetched, 1);
    expect(result.drifted).toBe(true);
    expect(result.factor).toBeCloseTo(0.5, 10); // 仅 09-03 一对有效
  });

  it('㉕tolerance 边界：恰好等于不告警（严格大于才报）', () => {
    // 1.25 二进制精确：|1.25-1|×100=25 恰等于阈值 → 不告警
    const stored = [{ date: '2026-09-01', close: 100 }];
    const fetched = [{ date: '2026-09-01', close: 125 }];
    expect(computeAdjustDrift(stored, fetched, 25)).toEqual({ drifted: false, factor: 1.25 });
    expect(computeAdjustDrift(stored, fetched, 24.9).drifted).toBe(true);
  });
});

describe('klineToRow（上游行二次防线）', () => {
  it('㉖合法映射：UTC 零点 + 量额原始口径（volume 正常取整）', () => {
    const row = klineToRow('sh600519', klineItem({ date: '2026-09-01', volume: 123.6, amount: 1040.5 }));
    expect(row).not.toBeNull();
    expect(row!.symbol).toBe('sh600519');
    expect(row!.date).toBe('2026-09-01');
    expect(row!.tradeDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(row!.open).toBe(10);
    expect(row!.high).toBe(10.8);
    expect(row!.low).toBe(9.9);
    expect(row!.close).toBe(10.4);
    expect(row!.volume).toBe(124);
    expect(row!.amount).toBe(1040.5);
  });

  it('㉗日期不可归一剔除（补零缺失/垃圾串）', () => {
    expect(klineToRow('sh600519', klineItem({ date: '2026-9-1' }))).toBeNull();
    expect(klineToRow('sh600519', klineItem({ date: '' }))).toBeNull();
  });

  it('㉘四价非正剔除（0/负数/NaN）', () => {
    expect(klineToRow('sh600519', klineItem({ open: 0 }))).toBeNull();
    expect(klineToRow('sh600519', klineItem({ close: -1 }))).toBeNull();
    expect(klineToRow('sh600519', klineItem({ high: Number.NaN }))).toBeNull();
  });

  it('㉙high<low 不在此层剔除（交给质量探针，职责分离）', () => {
    const row = klineToRow('sh600519', klineItem({ high: 9.8, low: 10.2 }));
    expect(row).not.toBeNull();
    expect(row!.high).toBe(9.8);
    expect(row!.low).toBe(10.2);
  });

  it('㉚量额脏值归零兜底（不因量额非法丢弃整行）', () => {
    const row = klineToRow('sh600519', klineItem({ volume: Number.NaN, amount: -5 }));
    expect(row).not.toBeNull();
    expect(row!.volume).toBe(0);
    expect(row!.amount).toBe(0);
  });
});
