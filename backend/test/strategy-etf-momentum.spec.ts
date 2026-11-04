// etf-momentum 模板信号纯函数单测（方案 §9 r4）。
// 基准 fixture：BASE(sh510300) 36 根全 10；X(sz510500) 阶梯 10×6→11×6→12×6→13×6→13×6→10×6。
// 期望值手工推演（score=c(d)/c(前5个交易日)−1，调仓日=日期≥锚日的序数%5==0，锚日=calendar[6]）：
//   idx6:  11/10−1=0.1  → BUY X；idx11: 11/11−1=0（最高分≤0）→ SELL X（空仓）；
//   idx16: 12/11−1>0    → BUY X；idx21: 13/12−1>0（已持有）→ 无信号；
//   idx26: 13/13−1=0    → SELL X；idx31: 10/13−1<0 → 目标空且无持仓 → 无信号。
import { etfMomentumStrategy } from '../src/modules/stock/strategy/strategy-templates.util';
import { StrategyInput, StrategySignal } from '../src/modules/stock/strategy/strategy.types';

const workdays = (count: number, start = '2026-08-24'): string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const DATES = workdays(36); // DATES[6]=锚日 d7，DATES[11]=d12 …

const bar = (date: string, close: number) => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1000,
  amount: close * 1000
});

/** 基准标的（轮动日历）：全 10。 */
const BASE_CLOSES = Array(36).fill(10);
/** 主角标的 X 阶梯。 */
const X_CLOSES = [
  ...Array(6).fill(10),
  ...Array(6).fill(11),
  ...Array(6).fill(12),
  ...Array(6).fill(13),
  ...Array(6).fill(13),
  ...Array(6).fill(10)
];

const buildInput = (
  barsBySymbol: Record<string, Array<{ date: string; close: number }>>,
  params: Record<string, unknown>,
  simStartDate: string
): StrategyInput => ({
  barsBySymbol: Object.fromEntries(
    Object.entries(barsBySymbol).map(([symbol, bars]) => [
      symbol,
      bars.map((entry) => bar(entry.date, entry.close))
    ])
  ),
  params,
  simStartDate
});

const baseFixture = (params: Record<string, unknown> = { lookbackN: 5, holdTop: 1, rebalanceDays: 5 }, simStartDate = DATES[6]) =>
  buildInput(
    {
      sh510300: BASE_CLOSES.map((close, i) => ({ date: DATES[i], close })),
      sz510500: X_CLOSES.map((close, i) => ({ date: DATES[i], close }))
    },
    params,
    simStartDate
  );

describe('etf-momentum strategy template', () => {
  it('top1 ranking with hand-derived rotation calendar (buy/sell/hold)', () => {
    const signals = etfMomentumStrategy.generateSignals(baseFixture());
    expect(signals).toEqual([
      { date: DATES[6], symbol: 'sz510500', action: 'buy' },
      { date: DATES[11], symbol: 'sz510500', action: 'sell' }, // 最高分 0≤0 → 空仓（全负/零动量清仓）
      { date: DATES[16], symbol: 'sz510500', action: 'buy' },
      { date: DATES[26], symbol: 'sz510500', action: 'sell' } // idx21 已持有且仍居首 → 无信号
    ]);
  });

  it('rebalance cadence is exact: zero signals on non-rebalance ordinals', () => {
    const signals = etfMomentumStrategy.generateSignals(baseFixture());
    const rebalanceDates = new Set([6, 11, 16, 21, 26, 31].map((i) => DATES[i]));
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(rebalanceDates.has(signal.date)).toBe(true);
    }
  });

  it('top2 ranking picks the two best scores in ranked order', () => {
    const aCloses = BASE_CLOSES.map((close, i) => (i >= 2 ? 11 : close)); // score(idx6)=0.1
    const bCloses = BASE_CLOSES.map((close, i) => (i >= 4 ? 10.5 : close)); // score(idx6)=0.05
    const signals = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: BASE_CLOSES.map((close, i) => ({ date: DATES[i], close })),
          sz510500: aCloses.map((close, i) => ({ date: DATES[i], close })),
          sz510600: bCloses.map((close, i) => ({ date: DATES[i], close }))
        },
        { lookbackN: 5, holdTop: 2, rebalanceDays: 5 },
        DATES[6]
      )
    );
    const atAnchor = signals.filter((signal) => signal.date === DATES[6]);
    expect(atAnchor).toEqual([
      { date: DATES[6], symbol: 'sz510500', action: 'buy' }, // 排名序：score 降序
      { date: DATES[6], symbol: 'sz510600', action: 'buy' }
    ]);
  });

  it('ties break by symbol dictionary order (deterministic)', () => {
    const aCloses = BASE_CLOSES.map((close, i) => (i >= 2 ? 11 : close));
    const bCloses = [...aCloses]; // 并列同分
    const signals = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: BASE_CLOSES.map((close, i) => ({ date: DATES[i], close })),
          sz510500: aCloses.map((close, i) => ({ date: DATES[i], close })),
          sz510600: bCloses.map((close, i) => ({ date: DATES[i], close }))
        },
        { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
        DATES[6]
      )
    );
    const atAnchor = signals.filter((signal) => signal.date === DATES[6]);
    expect(atAnchor).toEqual([{ date: DATES[6], symbol: 'sz510500', action: 'buy' }]); // sz510500 < sz510600
  });

  it('same-day sell-before-buy order frees cash for the incoming symbol', () => {
    // X: idx0..9=10 → idx10..19=12（idx10 BUY）→ idx20..35=8；Y: idx0..14=10 → idx15..35=13。
    // 锚日=DATES[10]：idx10 BUY X；idx15 X 动量归零/Y 动量 +30% → 同日 [SELL X, BUY Y] 顺序。
    const xCloses = [...Array(10).fill(10), ...Array(10).fill(12), ...Array(16).fill(8)];
    const yCloses = [...Array(15).fill(10), ...Array(21).fill(13)];
    const signals = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: BASE_CLOSES.map((close, i) => ({ date: DATES[i], close })),
          sz510500: xCloses.map((close, i) => ({ date: DATES[i], close })),
          sz510600: yCloses.map((close, i) => ({ date: DATES[i], close }))
        },
        { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
        DATES[10]
      )
    );
    expect(signals.filter((signal) => signal.date === DATES[10])).toEqual([
      { date: DATES[10], symbol: 'sz510500', action: 'buy' }
    ]);
    expect(signals.filter((signal) => signal.date === DATES[15])).toEqual([
      { date: DATES[15], symbol: 'sz510500', action: 'sell' }, // 先卖腾资金
      { date: DATES[15], symbol: 'sz510600', action: 'buy' } // 后买
    ]);
  });

  it('anchoring: prepending warmup bars never shifts the rebalance date set', () => {
    // 反证：窗口锚点=max(库内最早 bar, sim_start_date 前推预热)≤sim_start_date → 锚日=sim_start_date，
    // 与喂入窗口的数组下标无关——前置 6 根预热（日期轴向早处扩展，绝对日期不变）后同输入同调仓日集合。
    const plain = etfMomentumStrategy.generateSignals(baseFixture()).map((signal) => [signal.date, signal.symbol, signal.action]);
    const extra = Array(6).fill(10);
    const prepend = (closes: number[]) => [...extra, ...closes];
    // dates2 从早 6 个工作日起：dates2[6+i] === DATES[i]（绝对日期对齐，只向前扩预热段）
    const dates2 = workdays(42, '2026-08-14');
    expect(dates2[6]).toBe(DATES[0]);
    const warm = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: prepend(BASE_CLOSES).map((close, i) => ({ date: dates2[i], close })),
          sz510500: prepend(X_CLOSES).map((close, i) => ({ date: dates2[i], close }))
        },
        { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
        DATES[6] // 同一 sim_start_date（在 dates2 中位于 idx12）
      )
    );
    expect(warm.map((signal) => [signal.date, signal.symbol, signal.action])).toEqual(plain);
  });

  it('anchor fallback: window first day later than simStartDate re-anchors at the window first day', () => {
    // 反证（r4）：窗口切到 idx10 起（26 根），sim_start_date=DATES[6] 早于窗口首日 → 锚日=窗口首日，
    // 调仓日=窗口首日+k×5（回退是输入纯函数）；与「以 simStartDate 锚定」的相位集合不相交。
    const windowDates = DATES.slice(10);
    const signals: StrategySignal[] = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: BASE_CLOSES.slice(10).map((close, i) => ({ date: windowDates[i], close })),
          sz510500: X_CLOSES.slice(10).map((close, i) => ({ date: windowDates[i], close }))
        },
        { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
        DATES[6]
      )
    );
    // 手推：窗口 idx0(=原 idx10) baseIdx<lookbackN 无信号；idx5(=原 idx15) 12/11−1>0 → BUY；
    //       idx10(=原 idx20) 13/12−1>0 已持有无信号；idx15(=原 idx25) 13/13−1=0 → SELL；
    //       idx20/25 动量<0/0 且无持仓 → 无信号。
    expect(signals).toEqual([
      { date: DATES[15], symbol: 'sz510500', action: 'buy' },
      { date: DATES[25], symbol: 'sz510500', action: 'sell' }
    ]);
    // 相位差异锁定：simStartDate 锚定下该窗口的调仓日集合为 {d12,d17,d22,d27,d32}（原 idx11+5k），
    // 与回退集合 {d11,d16,d21,d26,d31,d36} 不相交——回退语义漂移即此断言失败。
    for (const signal of signals) {
      const windowIdx = windowDates.indexOf(signal.date);
      expect(windowIdx % 5).toBe(0);
    }
  });

  it('date-keyed lookup proof: an index-aligned implementation must fail on a misaligned calendar', () => {
    // Z 在 d5 与 d6 之间多一个交易日（x55），且收盘基准日 d2=9、其余 10：
    //   键控取数 score_Z(d7)=c(d7)/c(d2)−1=10/9−1>0 → BUY Z；
    //   下标对齐实现会取 Z[7]/Z[2]=c(d7)/c(d3)=0 → 无 BUY——断言 BUY 存在即锁死键控语义。
    const zDates = [...DATES.slice(0, 5), '2026-10-15', ...DATES.slice(5)];
    const zCloses = zDates.map((date) => (date === DATES[1] ? 9 : 10));
    const signals = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: BASE_CLOSES.map((close, i) => ({ date: DATES[i], close })),
          sz510700: zCloses.map((close, i) => ({ date: zDates[i], close }))
        },
        { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
        DATES[6]
      )
    );
    expect(signals).toContainEqual({ date: DATES[6], symbol: 'sz510700', action: 'buy' });
  });

  it('missing bars or missing lookback base date exclude the symbol (-Infinity), and warmup ordinals stay silent', () => {
    // W 缺 d2（d7 的回看基准日）→ d7 的动量分不可算 → 全程被排除；
    // 锚日=idx6 前无调仓日（序数<0 不存在）；idx6 处 baseIdx=6≥lookbackN=5 → 正常判定。
    const wDates = DATES.filter((date) => date !== DATES[1]);
    const signals = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: BASE_CLOSES.map((close, i) => ({ date: DATES[i], close })),
          sz510800: wDates.map((date) => ({ date, close: 20 }))
        },
        { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
        DATES[6]
      )
    );
    expect(signals).toEqual([]); // W 分数恒 -Infinity，BASE 恒 0 → 最高分≤0 → 空仓且无持仓
    // 基准回看日不足（调仓序数<lookbackN）→ 当日无信号：锚日切到 DATES[2]（idx2<5）
    const early = etfMomentumStrategy.generateSignals(
      buildInput(
        {
          sh510300: BASE_CLOSES.map((close, i) => ({ date: DATES[i], close })),
          sz510500: X_CLOSES.map((close, i) => ({ date: DATES[i], close }))
        },
        { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
        DATES[2]
      )
    );
    expect(early.some((signal) => signal.date === DATES[2])).toBe(false);
  });

  it('validateParams and metadata', () => {
    expect(etfMomentumStrategy.singleSymbol).toBe(false);
    expect(etfMomentumStrategy.validateParams({ lookbackN: 4, holdTop: 1, rebalanceDays: 5 })).toContain(
      '参数 lookbackN 必须为 [5, 120] 内的整数'
    );
    expect(etfMomentumStrategy.validateParams({ lookbackN: 5, holdTop: 3, rebalanceDays: 5 })).toContain(
      '参数 holdTop 必须为 [1, 2] 内的整数'
    );
    expect(etfMomentumStrategy.validateParams({ lookbackN: 5, holdTop: 1, rebalanceDays: 61 })).toContain(
      '参数 rebalanceDays 必须为 [1, 60] 内的整数'
    );
    expect(etfMomentumStrategy.validateParams({ lookbackN: 5, holdTop: 1, rebalanceDays: 5, fastN: 5 })).toEqual([
      expect.stringContaining('未知参数键 fastN')
    ]);
    expect(etfMomentumStrategy.validateParams({ lookbackN: 5, holdTop: 1, rebalanceDays: 5 })).toEqual([]);
    expect(etfMomentumStrategy.generateSignals(baseFixture({ lookbackN: 5, holdTop: 1, rebalanceDays: 5 }, DATES[6])).length)
      .toBeGreaterThan(0);
    // bars<minBars（21）→ 空信号
    expect(
      etfMomentumStrategy.generateSignals(
        buildInput(
          {
            sh510300: BASE_CLOSES.slice(0, 20).map((close, i) => ({ date: DATES[i], close })),
            sz510500: X_CLOSES.slice(0, 20).map((close, i) => ({ date: DATES[i], close }))
          },
          { lookbackN: 5, holdTop: 1, rebalanceDays: 5 },
          DATES[6]
        )
      )
    ).toEqual([]);
  });
});
