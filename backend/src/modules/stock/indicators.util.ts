// 技术指标纯函数库：输入 K 线序列输出指标序列与摘要信号。
// 全部无副作用、不依赖网络，便于单元测试；指标口径对齐国内主流行情软件。

export interface KlineItem {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 振幅 % */
  amplitude?: number;
  /** 涨跌幅 % */
  pct?: number;
  /** 换手率 % */
  turnover?: number;
}

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function emaSeries(values: number[], period: number): Series {
  const k = 2 / (period + 1);
  const out: Series = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      let seed = 0;
      for (let j = i - period + 1; j <= i; j += 1) {
        seed += values[j];
      }
      prev = seed / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

/** MACD：DIF=EMA12-EMA26，DEA=DIF 的 EMA9，柱=2*(DIF-DEA)（国内口径）。 */
export function macd(closes: number[], short = 12, long = 26, signal = 9) {
  const emaShort = emaSeries(closes, short);
  const emaLong = emaSeries(closes, long);
  const dif: Series = closes.map((_, i) =>
    emaShort[i] != null && emaLong[i] != null ? (emaShort[i] as number) - (emaLong[i] as number) : null
  );
  const dea: Series = closes.map(() => null);
  const firstIdx = dif.findIndex((v) => v != null);
  if (firstIdx >= 0) {
    const difValues = dif.slice(firstIdx).map((v) => v as number);
    const deaValues = emaSeries(difValues, signal);
    deaValues.forEach((v, i) => {
      dea[firstIdx + i] = v;
    });
  }
  const histogram: Series = dif.map((d, i) =>
    d != null && dea[i] != null ? (d - (dea[i] as number)) * 2 : null
  );
  return { dif, dea, histogram };
}

/** KDJ(9,3,3)：RSV→K→D→J，K/D 种子 50。 */
export function kdj(highs: number[], lows: number[], closes: number[], n = 9, m1 = 3, m2 = 3) {
  const kArr: Series = [];
  const dArr: Series = [];
  const jArr: Series = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < closes.length; i += 1) {
    if (i < n - 1) {
      kArr.push(null);
      dArr.push(null);
      jArr.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - n + 1; j <= i; j += 1) {
      hh = Math.max(hh, highs[j]);
      ll = Math.min(ll, lows[j]);
    }
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    const k = ((m1 - 1) / m1) * prevK + (1 / m1) * rsv;
    const d = ((m2 - 1) / m2) * prevD + (1 / m2) * k;
    kArr.push(k);
    dArr.push(d);
    jArr.push(3 * k - 2 * d);
    prevK = k;
    prevD = d;
  }
  return { k: kArr, d: dArr, j: jArr };
}

/** RSI（Wilder 平滑口径）。 */
export function rsi(closes: number[], period: number): Series {
  const out: Series = [null];
  if (closes.length <= period) {
    for (let i = 1; i < closes.length; i += 1) {
      out.push(null);
    }
    return out;
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    avgGain += Math.max(change, 0);
    avgLoss += Math.max(-change, 0);
    if (i < period) {
      out.push(null);
    }
  }
  avgGain /= period;
  avgLoss /= period;
  const push = () => {
    if (avgGain + avgLoss === 0) {
      out.push(50);
    } else {
      out.push((avgGain / (avgGain + avgLoss)) * 100);
    }
  };
  push();
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    push();
  }
  return out;
}

/** BOLL(20,2)：中轨 SMA20，上下轨 ±2 倍总体标准差。 */
export function boll(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: Series = closes.map(() => null);
  const lower: Series = closes.map(() => null);
  for (let i = period - 1; i < closes.length; i += 1) {
    const m = mid[i];
    if (m == null) {
      continue;
    }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      variance += (closes[j] - m) ** 2;
    }
    const sd = Math.sqrt(variance / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

/** ATR(14)：真实波幅的 Wilder 平滑。 */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): Series {
  const out: Series = [null];
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
    if (i < period) {
      out.push(null);
    }
  }
  if (trs.length < period) {
    return out;
  }
  let prev = trs.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  out.push(prev);
  for (let i = period; i < trs.length; i += 1) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out.push(prev);
  }
  return out;
}

/** OBV：能量潮，涨日累加量、跌日累减量。 */
export function obv(closes: number[], volumes: number[]): number[] {
  const out = [0];
  for (let i = 1; i < closes.length; i += 1) {
    const direction = Math.sign(closes[i] - closes[i - 1]);
    out.push(out[i - 1] + direction * volumes[i]);
  }
  return out;
}

/** WR(10)：威廉指标，>80 超卖（价格贴近区间低点），<20 超买。 */
export function wr(highs: number[], lows: number[], closes: number[], period = 10): Series {
  const out: Series = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      hh = Math.max(hh, highs[j]);
      ll = Math.min(ll, lows[j]);
    }
    out.push(hh === ll ? 50 : ((hh - closes[i]) / (hh - ll)) * 100);
  }
  return out;
}

/** BIAS：乖离率 (C-MA N)/MA N*100。 */
export function bias(closes: number[], period: number): Series {
  const ma = sma(closes, period);
  return closes.map((c, i) => (ma[i] != null ? ((c - (ma[i] as number)) / (ma[i] as number)) * 100 : null));
}

/** 量比：最新成交量 / 前 5 日均量。 */
export function volumeRatio(volumes: number[], period = 5): number | null {
  if (volumes.length <= period) {
    return null;
  }
  const recent = volumes.slice(volumes.length - 1 - period, volumes.length - 1);
  const avg = recent.reduce((sum, v) => sum + v, 0) / period;
  if (avg <= 0) {
    return null;
  }
  return volumes[volumes.length - 1] / avg;
}

export interface IndicatorSeriesPack {
  ma5: Series;
  ma10: Series;
  ma20: Series;
  ma60: Series;
  macd: { dif: Series; dea: Series; histogram: Series };
  kdj: { k: Series; d: Series; j: Series };
  rsi6: Series;
  rsi12: Series;
  rsi24: Series;
  boll: { mid: Series; upper: Series; lower: Series };
  /** 最新量比。 */
  volumeRatio: number | null;
}

/** 全量指标序列（供前端图表直接绘制）。 */
export function computeIndicatorSeries(klines: KlineItem[]): IndicatorSeriesPack {
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);
  return {
    ma5: sma(closes, 5),
    ma10: sma(closes, 10),
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
    macd: macd(closes),
    kdj: kdj(highs, lows, closes),
    rsi6: rsi(closes, 6),
    rsi12: rsi(closes, 12),
    rsi24: rsi(closes, 24),
    boll: boll(closes),
    volumeRatio: volumeRatio(volumes)
  };
}

export interface IndicatorSummary {
  lastClose: number;
  pct1d: number | null;
  pct5d: number | null;
  pct20d: number | null;
  pct60d: number | null;
  ma: { ma5: number | null; ma10: number | null; ma20: number | null; ma60: number | null };
  /** 均线排列：bull 多头 / bear 空头 / mixed 纠缠。 */
  maAlignment: 'bull' | 'bear' | 'mixed';
  /** 收盘价相对 MA20 的乖离 %。 */
  priceVsMa20: number | null;
  macd: { dif: number | null; dea: number | null; histogram: number | null };
  /** 最近一次交叉：golden 金叉 / dead 死叉 / none；barsAgo 距今天数。 */
  macdCross: 'golden' | 'dead' | 'none';
  macdCrossAgo: number | null;
  kdj: { k: number | null; d: number | null; j: number | null };
  /** KDJ 金叉（K 上穿 D，近 3 日内）。 */
  kdjGolden: boolean;
  rsi: { rsi6: number | null; rsi12: number | null; rsi24: number | null };
  boll: { mid: number | null; upper: number | null; lower: number | null };
  /** 布林带内位置：0=下轨，100=上轨。 */
  bollPosition: number | null;
  volume: { today: number; avg5: number; ratio: number | null; obvTrend: 'up' | 'down' | 'flat' };
  /** ATR / 收盘价，衡量波动强度。 */
  atrPct: number | null;
  /** 数据范围内的最高/最低（约 52 周）与当前位置 0-100。 */
  range: { high: number; low: number; position: number };
  /** 近 10 个交易日明细。 */
  recent: KlineItem[];
}

const last = (arr: Series): number | null => {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] != null && Number.isFinite(arr[i] as number)) {
      return arr[i] as number;
    }
  }
  return null;
};

const pctChange = (closes: number[], days: number): number | null => {
  if (closes.length <= days) {
    return null;
  }
  const from = closes[closes.length - 1 - days];
  if (from === 0) {
    return null;
  }
  return ((closes[closes.length - 1] - from) / from) * 100;
};

const round2 = (v: number | null): number | null => (v == null ? null : Math.round(v * 100) / 100);

/** 指标摘要：只保留最新值与信号判定，用于数据简报与专家提示词。 */
export function summarizeIndicators(klines: KlineItem[]): IndicatorSummary | null {
  if (klines.length < 2) {
    return null;
  }
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);
  const pack = computeIndicatorSeries(klines);

  const ma5 = last(pack.ma5);
  const ma10 = last(pack.ma10);
  const ma20 = last(pack.ma20);
  const ma60 = last(pack.ma60);
  let maAlignment: IndicatorSummary['maAlignment'] = 'mixed';
  if (ma5 != null && ma10 != null && ma20 != null && ma60 != null) {
    if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) {
      maAlignment = 'bull';
    } else if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) {
      maAlignment = 'bear';
    }
  }

  // MACD 交叉：从尾部回溯找最近一次 DIF/DEA 相对关系翻转。
  let macdCross: 'golden' | 'dead' | 'none' = 'none';
  let macdCrossAgo: number | null = null;
  for (let i = pack.macd.dif.length - 1; i > 0; i -= 1) {
    const dNow = pack.macd.dif[i];
    const deaNow = pack.macd.dea[i];
    const dPrev = pack.macd.dif[i - 1];
    const deaPrev = pack.macd.dea[i - 1];
    if (dNow == null || deaNow == null || dPrev == null || deaPrev == null) {
      continue;
    }
    if (dPrev <= deaPrev && dNow > deaNow) {
      macdCross = 'golden';
      macdCrossAgo = pack.macd.dif.length - 1 - i;
      break;
    }
    if (dPrev >= deaPrev && dNow < deaNow) {
      macdCross = 'dead';
      macdCrossAgo = pack.macd.dif.length - 1 - i;
      break;
    }
  }

  const kNow = last(pack.kdj.k);
  const dNow = last(pack.kdj.d);
  let kdjGolden = false;
  for (let i = pack.kdj.k.length - 1; i >= Math.max(1, pack.kdj.k.length - 3); i -= 1) {
    const k1 = pack.kdj.k[i];
    const d1 = pack.kdj.d[i];
    const k0 = pack.kdj.k[i - 1];
    const d0 = pack.kdj.d[i - 1];
    if (k1 == null || d1 == null || k0 == null || d0 == null) {
      continue;
    }
    if (k0 <= d0 && k1 > d1) {
      kdjGolden = true;
      break;
    }
  }

  const obvSeries = obv(closes, volumes);
  const obvNow = obvSeries[obvSeries.length - 1];
  const obvPast = obvSeries[Math.max(0, obvSeries.length - 1 - 5)];
  const obvDelta = obvNow - obvPast;
  const obvTrend: 'up' | 'down' | 'flat' =
    Math.abs(obvDelta) < Math.max(1, volumes.slice(-5).reduce((s, v) => s + v, 0) * 0.05)
      ? 'flat'
      : obvDelta > 0
        ? 'up'
        : 'down';

  const bollMid = last(pack.boll.mid);
  const bollUpper = last(pack.boll.upper);
  const bollLower = last(pack.boll.lower);
  let bollPosition: number | null = null;
  if (bollMid != null && bollUpper != null && bollLower != null && bollUpper > bollLower) {
    bollPosition = ((closes[closes.length - 1] - bollLower) / (bollUpper - bollLower)) * 100;
  }

  const atrNow = last(atr(highs, lows, closes));
  const highRange = Math.max(...highs);
  const lowRange = Math.min(...lows);
  const avg5 =
    volumes.length >= 6
      ? volumes.slice(volumes.length - 6, volumes.length - 1).reduce((s, v) => s + v, 0) / 5
      : volumes[0];

  return {
    lastClose: closes[closes.length - 1],
    pct1d: pctChange(closes, 1),
    pct5d: pctChange(closes, 5),
    pct20d: pctChange(closes, 20),
    pct60d: pctChange(closes, Math.min(60, closes.length - 1)),
    ma: { ma5: round2(ma5), ma10: round2(ma10), ma20: round2(ma20), ma60: round2(ma60) },
    maAlignment,
    priceVsMa20: ma20 != null ? round2(((closes[closes.length - 1] - ma20) / ma20) * 100) : null,
    macd: {
      dif: round2(last(pack.macd.dif)),
      dea: round2(last(pack.macd.dea)),
      histogram: round2(last(pack.macd.histogram))
    },
    macdCross,
    macdCrossAgo,
    kdj: { k: round2(kNow), d: round2(dNow), j: round2(last(pack.kdj.j)) },
    kdjGolden,
    rsi: { rsi6: round2(last(pack.rsi6)), rsi12: round2(last(pack.rsi12)), rsi24: round2(last(pack.rsi24)) },
    boll: { mid: round2(bollMid), upper: round2(bollUpper), lower: round2(bollLower) },
    bollPosition: round2(bollPosition),
    volume: {
      today: volumes[volumes.length - 1],
      avg5: Math.round(avg5),
      ratio: round2(pack.volumeRatio),
      obvTrend
    },
    atrPct:
      atrNow != null && closes[closes.length - 1] > 0
        ? round2((atrNow / closes[closes.length - 1]) * 100)
        : null,
    range: {
      high: highRange,
      low: lowRange,
      position:
        highRange > lowRange
          ? Math.round(((closes[closes.length - 1] - lowRange) / (highRange - lowRange)) * 100)
          : 50
    },
    recent: klines.slice(-10)
  };
}

/** 规则信号评分（-2 ~ 2）：无模型渠道时的本地兜底依据，各专家取用自己流派的分数。 */
export interface RuleSignals {
  trendScore: number;
  momentumScore: number;
  flowScore: number;
  valueScore: number;
}

export function computeRuleSignals(
  summary: IndicatorSummary,
  valuation?: { pe?: number | null; pb?: number | null; turnover?: number | null }
): RuleSignals {
  const trendScore =
    (summary.macdCross === 'golden' ? 1 : summary.macdCross === 'dead' ? -1 : 0) +
    (summary.maAlignment === 'bull' ? 1 : summary.maAlignment === 'bear' ? -1 : 0) +
    (summary.priceVsMa20 != null ? (summary.priceVsMa20 > 0 ? 0.5 : -0.5) : 0);

  const rsi6 = summary.rsi.rsi6;
  const j = summary.kdj.j;
  let momentumScore = 0;
  if (summary.kdjGolden) {
    momentumScore += 1;
  }
  if (rsi6 != null) {
    if (rsi6 < 30) {
      momentumScore += 1;
    } else if (rsi6 > 80) {
      momentumScore -= 1;
    }
  }
  if (j != null) {
    if (j < 0) {
      momentumScore += 0.5;
    } else if (j > 100) {
      momentumScore -= 0.5;
    }
  }
  if (summary.pct5d != null && summary.pct5d < -8) {
    momentumScore += 0.5; // 短线超跌反弹动能
  }

  let flowScore = 0;
  if (summary.volume.ratio != null) {
    if (summary.volume.ratio > 1.5 && (summary.pct1d ?? 0) > 0) {
      flowScore += 1; // 放量上涨
    } else if (summary.volume.ratio > 1.5 && (summary.pct1d ?? 0) < 0) {
      flowScore -= 1; // 放量下跌
    } else if (summary.volume.ratio < 0.7) {
      flowScore -= 0.5; // 明显缩量
    }
  }
  if (summary.volume.obvTrend === 'up') {
    flowScore += 1;
  } else if (summary.volume.obvTrend === 'down') {
    flowScore -= 0.5;
  }

  let valueScore = 0;
  const pe = valuation?.pe ?? null;
  if (pe != null) {
    if (pe > 0 && pe < 15) {
      valueScore += 1;
    } else if (pe > 60) {
      valueScore -= 1;
    }
  }
  const turnover = valuation?.turnover ?? null;
  if (turnover != null && turnover > 15) {
    valueScore -= 1; // 换手过热，投机氛围浓
  }
  if (summary.range.position < 20) {
    valueScore += 0.5; // 处于阶段低位，安全边际较高
  } else if (summary.range.position > 90) {
    valueScore -= 0.5;
  }

  const clamp = (v: number) => Math.max(-2, Math.min(2, Math.round(v * 2) / 2));
  return {
    trendScore: clamp(trendScore),
    momentumScore: clamp(momentumScore),
    flowScore: clamp(flowScore),
    valueScore: clamp(valueScore)
  };
}

/** 分数 → 立场与置信度（本地兜底用）。 */
export function scoreToStance(score: number): { direction: 'bull' | 'bear' | 'neutral'; confidence: number } {
  if (score >= 1) {
    return { direction: 'bull', confidence: Math.min(85, 50 + score * 10) };
  }
  if (score <= -1) {
    return { direction: 'bear', confidence: Math.min(85, 50 + Math.abs(score) * 10) };
  }
  return { direction: 'neutral', confidence: 45 };
}

// ==================== 选股（Screener）纯函数 ====================

export type KlineFreq = 'day' | 'week' | 'month';

/** 日 K 重采样为周/月 K（东财原生周期不可用时的兜底；ISO 周一锚定 / 自然月聚合）。 */
export function resampleKlines(daily: KlineItem[], freq: 'week' | 'month'): KlineItem[] {
  if (freq === 'week') {
    const buckets = new Map<string, KlineItem[]>();
    for (const bar of daily) {
      const d = new Date(`${bar.date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) {
        continue;
      }
      // ISO 周：周四所属周为锚（周一为一周起点）
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() - day + 1);
      const weekKey = d.toISOString().slice(0, 10);
      const list = buckets.get(weekKey) ?? [];
      list.push(bar);
      buckets.set(weekKey, list);
    }
    return [...buckets.values()].map(aggregateBucket).filter((bar): bar is KlineItem => bar !== null);
  }
  const buckets = new Map<string, KlineItem[]>();
  for (const bar of daily) {
    const monthKey = bar.date.slice(0, 7);
    const list = buckets.get(monthKey) ?? [];
    list.push(bar);
    buckets.set(monthKey, list);
  }
  return [...buckets.values()].map(aggregateBucket).filter((bar): bar is KlineItem => bar !== null);
}

const aggregateBucket = (bars: KlineItem[]): KlineItem | null => {
  if (!bars.length) {
    return null;
  }
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const open = sorted[0].open;
  const close = sorted[sorted.length - 1].close;
  const high = Math.max(...sorted.map((b) => b.high));
  const low = Math.min(...sorted.map((b) => b.low));
  return {
    date: sorted[sorted.length - 1].date,
    open,
    close,
    high,
    low,
    volume: sorted.reduce((sum, b) => sum + b.volume, 0),
    amount: sorted.reduce((sum, b) => sum + b.amount, 0),
    pct:
      open > 0
        ? Math.round(((close - open) / open) * 10000) / 100
        : sorted[sorted.length - 1].pct,
    turnover: sorted[sorted.length - 1].turnover
  };
};

export interface CrossSignal {
  /** golden=已金叉（近 withinBars 内上穿）；upcoming=即将金叉；null=无信号。 */
  status: 'golden' | 'upcoming' | null;
  /** 金叉发生距今的 bar 数（golden 时有效）。 */
  barsAgo?: number;
  /** 快线-慢线当前差值（upcoming 时用于展示收敛程度）。 */
  gap?: number;
}

/** 交叉检测的相对误差阈值：过滤浮点累积误差造成的 epsilon 级假交叉（如恒定斜率序列 DIF≈DEA）。 */
const CROSS_EPSILON = 1e-9;

const meaningfulGap = (gap: number, scale: number): boolean =>
  Math.abs(gap) > CROSS_EPSILON * Math.max(1, Math.abs(scale));

/** 最近一次上穿（金叉）：在 withinBars 内快线 a 从下方穿越慢线 b。 */
export function detectGoldenCross(a: Series, b: Series, withinBars = 3): CrossSignal {
  const n = Math.min(a.length, b.length);
  for (let i = n - 1; i >= Math.max(1, n - withinBars); i -= 1) {
    const aNow = a[i];
    const bNow = b[i];
    const aPrev = a[i - 1];
    const bPrev = b[i - 1];
    if (aNow == null || bNow == null || aPrev == null || bPrev == null) {
      continue;
    }
    if (
      aPrev <= bPrev &&
      aNow > bNow &&
      meaningfulGap(aNow - bNow, Math.max(Math.abs(aNow), Math.abs(bNow)))
    ) {
      return { status: 'golden', barsAgo: n - 1 - i };
    }
  }
  return { status: null };
}

/**
 * 即将金叉判定（可解释启发式，基于最新一根 bar 的状态）：
 * 1. 快线在慢线下方（gap < 0）；
 * 2. 快线上行（a[n-1] > a[n-2]）；
 * 3. 差值在收敛（|gap| < |prevGap|）；
 * 4. 按当前收敛速度估算 ≤3 根内可交叉（|gap| ≤ 3×单根收敛量）。
 */
export function detectUpcomingCross(a: Series, b: Series): CrossSignal {
  const n = Math.min(a.length, b.length);
  if (n < 2) {
    return { status: null };
  }
  const aNow = a[n - 1];
  const bNow = b[n - 1];
  const aPrev = a[n - 2];
  const bPrev = b[n - 2];
  if (aNow == null || bNow == null || aPrev == null || bPrev == null) {
    return { status: null };
  }
  const gap = aNow - bNow;
  const prevGap = aPrev - bPrev;
  const scale = Math.max(Math.abs(aNow), Math.abs(bNow));
  // 必须在慢线下方有意义的距离，否则是浮点抖动而非"接近金叉"
  if (!meaningfulGap(gap, scale) || !meaningfulGap(prevGap, scale)) {
    return { status: null };
  }
  if (gap >= 0 || prevGap >= 0 || aNow <= aPrev || Math.abs(gap) >= Math.abs(prevGap)) {
    return { status: null };
  }
  const convergePerBar = Math.abs(prevGap) - Math.abs(gap);
  if (convergePerBar > 0 && Math.abs(gap) <= 3 * convergePerBar) {
    return { status: 'upcoming', gap: Math.round(gap * 10000) / 10000 };
  }
  return { status: null };
}

export type ScreenerIndicator = 'kdj' | 'macd';
export type ScreenerStatusFilter = 'golden' | 'upcoming' | 'both';
export type ScreenerMode = 'any' | 'all';

export interface ScreenerOptions {
  indicators: ScreenerIndicator[];
  mode: ScreenerMode;
  status: ScreenerStatusFilter;
  withinBars: number;
}

export interface ScreenerIndicatorSignal extends CrossSignal {
  /** 快线/慢线最新值，便于前端展示。 */
  fast?: number | null;
  slow?: number | null;
}

export interface ScreenerEvaluation {
  kdj: ScreenerIndicatorSignal;
  macd: ScreenerIndicatorSignal;
  /** 是否命中筛选条件。 */
  matched: boolean;
}

const statusMatches = (status: 'golden' | 'upcoming' | null, filter: ScreenerStatusFilter): boolean => {
  if (!status) {
    return false;
  }
  return filter === 'both' || status === filter;
};

/** 对单只股票单周期评估 KDJ/MACD 金叉与即将金叉。 */
export function evaluateScreener(klines: KlineItem[], options: ScreenerOptions): ScreenerEvaluation | null {
  if (klines.length < 35) {
    // MACD(12,26,9) 至少需要 35 根才形成有效 DEA
    return null;
  }
  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const macdPack = macd(closes);
  const kdjPack = kdj(highs, lows, closes);

  const build = (indicator: ScreenerIndicator): ScreenerIndicatorSignal => {
    const fast = indicator === 'macd' ? macdPack.dif : kdjPack.k;
    const slow = indicator === 'macd' ? macdPack.dea : kdjPack.d;
    const golden = detectGoldenCross(fast, slow, options.withinBars);
    if (golden.status) {
      return {
        status: 'golden',
        barsAgo: golden.barsAgo,
        fast: Math.round((fast[fast.length - 1] as number) * 100) / 100,
        slow: Math.round((slow[slow.length - 1] as number) * 100) / 100
      };
    }
    const upcoming = detectUpcomingCross(fast, slow);
    if (upcoming.status) {
      return {
        status: 'upcoming',
        gap: upcoming.gap,
        fast: Math.round((fast[fast.length - 1] as number) * 100) / 100,
        slow: Math.round((slow[slow.length - 1] as number) * 100) / 100
      };
    }
    return { status: null };
  };

  const signals: Record<ScreenerIndicator, ScreenerIndicatorSignal> = {
    kdj: options.indicators.includes('kdj') ? build('kdj') : { status: null },
    macd: options.indicators.includes('macd') ? build('macd') : { status: null }
  };

  const active = options.indicators.filter((indicator) => signals[indicator].status);
  const matched =
    options.mode === 'all'
      ? options.indicators.length > 0 &&
        options.indicators.every((indicator) => statusMatches(signals[indicator].status, options.status))
      : active.some((indicator) => statusMatches(signals[indicator].status, options.status));

  return { kdj: signals.kdj, macd: signals.macd, matched };
}
