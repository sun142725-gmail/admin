// 选股纯函数单测：重采样、金叉检测、即将金叉启发式、整段评估（不依赖网络与 Nest 容器）。
import {
  KlineItem,
  detectGoldenCross,
  detectUpcomingCross,
  evaluateScreener,
  macd,
  kdj,
  resampleKlines
} from '../src/modules/stock/indicators.util';

/** 构造一根日 K。 */
const bar = (date: string, close: number, open = close, high = Math.max(open, close) * 1.01, low = Math.min(open, close) * 0.99, volume = 10000): KlineItem => ({
  date,
  open,
  close,
  high,
  low,
  volume,
  amount: volume * close
});

/** 生成连续交易日序列（跳过周末，简化即可——重采样只依赖日期分组）。 */
const tradingDates = (count: number, start = '2024-01-01'): string[] => {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (out.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

/** 合成 K 线：先长期阴跌（快线在慢线下方），末端反弹制造 KDJ/MACD 金叉（金叉出现在反弹段内）。 */
const buildGoldenCrossKlines = (total = 120): KlineItem[] => {
  const reboundBars = 30;
  const declineBars = total - reboundBars;
  const dates = tradingDates(total);
  const closes: number[] = [];
  for (let i = 0; i < declineBars; i += 1) {
    closes.push(100 - i * 0.5);
  }
  const trough = closes[closes.length - 1];
  for (let i = 0; i < reboundBars; i += 1) {
    closes.push(trough + i * 1.2);
  }
  return dates.map((date, i) => bar(date, closes[i], closes[Math.max(0, i - 1)]));
};

describe('resampleKlines', () => {
  it('周线聚合：同周一的开收高低量合并', () => {
    // 2024-01-02（周二）~ 01-05（周五）为同一 ISO 周
    const daily = [
      bar('2024-01-02', 10, 9, 11, 8.5, 100),
      bar('2024-01-03', 11, 10, 12, 9.5, 200),
      bar('2024-01-04', 12, 11, 13, 10.5, 300),
      bar('2024-01-05', 11, 12, 12.5, 10.5, 400),
      // 下一周
      bar('2024-01-08', 12, 11, 13, 11, 500)
    ];
    const weekly = resampleKlines(daily, 'week');
    expect(weekly).toHaveLength(2);
    expect(weekly[0].open).toBe(9);
    expect(weekly[0].close).toBe(11);
    expect(weekly[0].high).toBe(13);
    expect(weekly[0].low).toBe(8.5);
    expect(weekly[0].volume).toBe(1000);
    expect(weekly[1].date).toBe('2024-01-08');
  });

  it('月线聚合：跨月正确分组', () => {
    const daily = [bar('2024-01-15', 10), bar('2024-01-31', 11), bar('2024-02-01', 12), bar('2024-02-28', 13)];
    const monthly = resampleKlines(daily, 'month');
    expect(monthly).toHaveLength(2);
    expect(monthly[0].close).toBe(11);
    expect(monthly[1].close).toBe(13);
  });
});

describe('detectGoldenCross / detectUpcomingCross', () => {
  it('K 上穿 D 在窗口内 → golden 且 barsAgo 正确', () => {
    const k = [null, 40, 50, 60] as (number | null)[];
    const d = [null, 45, 50, 55] as (number | null)[];
    const signal = detectGoldenCross(k, d, 3);
    expect(signal.status).toBe('golden');
    expect(signal.barsAgo).toBe(0); // 最后一根刚上穿
  });

  it('金叉发生在窗口外 → 无信号', () => {
    const k = [30, 40, 60, 61, 62] as (number | null)[];
    const d = [45, 45, 50, 51, 52] as (number | null)[];
    // 上穿发生在 index 1→2，距今 3 根；withinBars=2 时不可见
    const signal = detectGoldenCross(k, d, 2);
    expect(signal.status).toBeNull();
  });

  it('快线下方且快速收敛 → upcoming；已上方 → null', () => {
    const fast = [10, 9, 9.6, 9.9] as (number | null)[]; // gap: -1 → -0.4（收敛 0.6）
    const slow = [11, 10, 10, 10] as (number | null)[];
    const upcoming = detectUpcomingCross(fast, slow);
    expect(upcoming.status).toBe('upcoming');

    const above = detectUpcomingCross([12, 12.5] as (number | null)[], [11, 11] as (number | null)[]);
    expect(above.status).toBeNull();
  });

  it('发散中 → upcoming 为 null', () => {
    const fast = [9.0, 9.2, 9.3] as (number | null)[]; // gap: -1 → -0.7? 让 gap 扩大：slow 上升更快
    const slow = [10, 10.5, 11] as (number | null)[]; // gap: -1 → -1.3 → -1.7 发散
    expect(detectUpcomingCross(fast, slow).status).toBeNull();
  });
});

describe('evaluateScreener', () => {
  it('V 型反转合成序列能命中金叉（日线，任一指标，宽窗口）', () => {
    const klines = buildGoldenCrossKlines();
    const evaluation = evaluateScreener(klines, {
      indicators: ['kdj', 'macd'],
      mode: 'any',
      status: 'golden',
      withinBars: 30
    });
    expect(evaluation).not.toBeNull();
    expect(evaluation!.matched).toBe(true);
    const kdjHit = evaluation!.kdj.status === 'golden';
    const macdHit = evaluation!.macd.status === 'golden';
    expect(kdjHit || macdHit).toBe(true);
  });

  it('收窄窗口到金叉发生之前 → 不再命中（窗口语义生效）', () => {
    // 金叉发生在反弹段内（距今 > 3 根）：withinBars=3 应视为"不 freshly 金叉"
    const evaluation = evaluateScreener(buildGoldenCrossKlines(), {
      indicators: ['kdj', 'macd'],
      mode: 'any',
      status: 'golden',
      withinBars: 3
    });
    expect(evaluation?.matched ?? false).toBe(false);
  });

  it('单边阴跌序列 MACD 不命中（KDJ 因日内波动可能出现小金叉，属规则真实行为）', () => {
    const dates = tradingDates(80);
    const klines = dates.map((date, i) => bar(date, 100 - i * 0.6, 100 - (i - 1) * 0.6));
    const evaluation = evaluateScreener(klines, {
      indicators: ['macd'],
      mode: 'any',
      status: 'golden',
      withinBars: 30
    });
    expect(evaluation?.matched ?? false).toBe(false);
    expect(evaluation?.macd.status).toBeNull();
  });

  it('all 模式下 matched 蕴含每个所选指标都命中', () => {
    const klines = buildGoldenCrossKlines();
    const allMode = evaluateScreener(klines, {
      indicators: ['kdj', 'macd'],
      mode: 'all',
      status: 'golden',
      withinBars: 30
    });
    if (allMode!.matched) {
      expect(allMode!.kdj.status).toBe('golden');
      expect(allMode!.macd.status).toBe('golden');
    }
  });

  it('数据不足 35 根返回 null', () => {
    expect(
      evaluateScreener(buildGoldenCrossKlines().slice(0, 20), {
        indicators: ['kdj'],
        mode: 'any',
        status: 'golden',
        withinBars: 30
      })
    ).toBeNull();
  });

  it('周线重采样后指标仍然可算（KDJ/MACD 有值）', () => {
    const weekly = resampleKlines(buildGoldenCrossKlines(400), 'week');
    expect(weekly.length).toBeGreaterThan(35);
    const pack = kdj(weekly.map((k) => k.high), weekly.map((k) => k.low), weekly.map((k) => k.close));
    const macdPack = macd(weekly.map((k) => k.close));
    expect(pack.k[pack.k.length - 1]).not.toBeNull();
    expect(macdPack.dif[macdPack.dif.length - 1]).not.toBeNull();
  });
});
