// 日线行情库质量探针纯函数单测（不依赖网络与 Nest 容器）：
// 工作日缺口（周一~五口径，法定长假误报是显式声明口径）/ 单根异常四码 / 除权跳变 / 单标的聚合 / 缺口锚点。
import { isoDay } from '../src/modules/stock/daily-bars/daily-bars-calib.util';
import {
  BarAnomalyCode,
  detectBarAnomalies,
  detectSuspiciousJumps,
  detectWeekdayGaps,
  earliestGapAnchor,
  JUMP_THRESHOLD_PCT,
  MIN_GAP_DAYS,
  QualityBarRow,
  summarizeSymbolQuality
} from '../src/modules/stock/daily-bars/daily-bars-quality.util';

const row = (date: string, close: number, overrides: Partial<QualityBarRow> = {}): QualityBarRow => ({
  date,
  open: close * 0.99,
  high: close * 1.02,
  low: close * 0.98,
  close,
  volume: 100,
  ...overrides
});

// 2026-09 实历：09-01 周二、09-04 周五、09-07 周一、09-14 周一、09-18 周五、09-21 周一
const NORMAL_WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

describe('MIN_GAP_DAYS 共享默认阈值', () => {
  it('①常量=3（单日/双日假不报、长假报的分界）', () => {
    expect(MIN_GAP_DAYS).toBe(3);
  });
});

describe('detectWeekdayGaps（周一~五日历日缺失推断）', () => {
  it('②连续交易日无缺口', () => {
    expect(detectWeekdayGaps(NORMAL_WEEK.map((d) => row(d, 10)))).toEqual([]);
  });

  it('③跨周末不报（周五→周一跳过 0 个工作日）', () => {
    expect(detectWeekdayGaps([row('2026-09-18', 10), row('2026-09-21', 10.1)])).toEqual([]);
  });

  it('④单日假（默认阈值 3）不报：跳过 1 个工作日', () => {
    // 09-16(周三) → 09-18(周五)，跳过周四一天
    expect(detectWeekdayGaps([row('2026-09-16', 10), row('2026-09-18', 10.1)])).toEqual([]);
  });

  it('⑤双日假不报：跳过 2 个工作日仍低于阈值', () => {
    // 09-15(周二) → 09-18(周五)，跳过周三/周四两天
    expect(detectWeekdayGaps([row('2026-09-15', 10), row('2026-09-18', 10.1)])).toEqual([]);
  });

  it('⑥跨长假报缺口：from/to/skippedWeekdays 正确（outsideAutoWindow 缺省 false）', () => {
    // 09-03(周四) → 09-14(周一)：跳过 09-04(五)、07~11(一~五) 共 6 个工作日
    const gaps = detectWeekdayGaps([row('2026-09-03', 10), row('2026-09-14', 10.1)]);
    expect(gaps).toEqual([{ from: '2026-09-03', to: '2026-09-14', skippedWeekdays: 6, outsideAutoWindow: false }]);
  });

  it('⑦单根/空数组无缺口', () => {
    expect(detectWeekdayGaps([row('2026-09-14', 10)])).toEqual([]);
    expect(detectWeekdayGaps([])).toEqual([]);
  });

  it('⑧乱序输入先排序后计算', () => {
    const gaps = detectWeekdayGaps([row('2026-09-14', 10.1), row('2026-09-03', 10)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toBe('2026-09-03');
    expect(gaps[0].to).toBe('2026-09-14');
  });

  it('⑨自定义阈值：同一缺口阈值降到 2 也不报 1 天缺口、升到 7 放过 6 天长假', () => {
    const rows = [row('2026-09-16', 10), row('2026-09-18', 10.1)]; // 跳过 1 天
    expect(detectWeekdayGaps(rows, 1)).toHaveLength(1);
    expect(detectWeekdayGaps(rows, 2)).toEqual([]);
    expect(detectWeekdayGaps([row('2026-09-03', 10), row('2026-09-14', 10.1)], 7)).toEqual([]);
  });
});

describe('detectBarAnomalies（单根四码）', () => {
  it('⑩正常行返回空', () => {
    expect(detectBarAnomalies(row('2026-09-14', 10))).toEqual([]);
  });

  it('⑪zero_volume：成交量 0（停牌占位）', () => {
    expect(detectBarAnomalies(row('2026-09-14', 10, { volume: 0 }))).toEqual(['zero_volume']);
  });

  it('⑫non_positive_price：low=0 且不叠加他码（其余价正常、开收仍在区间内）', () => {
    const codes = detectBarAnomalies(row('2026-09-14', 10.5, { open: 10, high: 11, low: 0, close: 10.5 }));
    expect(codes).toEqual(['non_positive_price']);
  });

  it('⑬oc_out_of_range：高开越出 high（单码）', () => {
    const codes = detectBarAnomalies(row('2026-09-14', 10.5, { open: 12, high: 11, low: 9, close: 10.5 }));
    expect(codes).toEqual(['oc_out_of_range']);
  });

  it('⑭一例叠加多码且顺序固定：high<low 必然伴随开收越界（区间倒挂无内点）+ 全四码样本', () => {
    const codes: BarAnomalyCode[] = detectBarAnomalies(
      row('2026-09-14', 0, { open: 12, high: 9.9, low: 10.1, close: 0, volume: 0 })
    );
    expect(codes).toEqual(['zero_volume', 'non_positive_price', 'high_low_inverted', 'oc_out_of_range']);
  });

  it('⑮除权日收盘大跌不是异常码（留给跳变探针，职责分离）', () => {
    expect(detectBarAnomalies(row('2026-09-14', 6))).toEqual([]);
  });
});

describe('detectSuspiciousJumps（相邻收盘跳变）', () => {
  it('⑯跳变检出：+30% 超默认阈值', () => {
    const jumps = detectSuspiciousJumps([row('2026-09-14', 10), row('2026-09-15', 13)]);
    expect(jumps).toEqual([{ tradeDate: '2026-09-15', pct: 30 }]);
  });

  it('⑰正常波动不报：±10% 以内静默', () => {
    expect(detectSuspiciousJumps([row('2026-09-14', 10), row('2026-09-15', 11)])).toEqual([]);
  });

  it('⑱首根无前值不报', () => {
    expect(detectSuspiciousJumps([row('2026-09-14', 10)])).toEqual([]);
  });

  it('⑲阈值边界：恰等于 20% 不报（严格大于），20.01% 报', () => {
    // 10 → 12 恰 +20%
    expect(detectSuspiciousJumps([row('2026-09-14', 10), row('2026-09-15', 12)])).toEqual([]);
    expect(detectSuspiciousJumps([row('2026-09-14', 10), row('2026-09-15', 12.01)]).length).toBe(1);
    expect(JUMP_THRESHOLD_PCT).toBe(20);
  });

  it('⑳前值非正（停牌 0 收盘）不报：比值无意义，异常已由 non_positive_price 标记', () => {
    expect(detectSuspiciousJumps([row('2026-09-14', 0), row('2026-09-15', 10)])).toEqual([]);
  });

  it('㉑负向跳变（除权 seam）检出且 pct 保留两位小数', () => {
    const jumps = detectSuspiciousJumps([row('2026-09-14', 13), row('2026-09-15', 10)]);
    expect(jumps).toEqual([{ tradeDate: '2026-09-15', pct: -23.08 }]);
  });
});

describe('summarizeSymbolQuality（单标的聚合）', () => {
  const TODAY = new Date('2026-11-04T00:00:00.000Z');
  const WINDOW = 250;
  // today−250 日历天的窗口下界（与实现同式计算，避免测试硬编码漂移）
  const cutoff = isoDay(new Date(Date.UTC(2026, 10, 4) - WINDOW * 86400000));

  it('㉒聚合数对：barCount/first/last/gaps/anomalies/jumps', () => {
    const rows = [
      row('2026-09-03', 10),
      // 缺口：09-03 → 09-14（跳 6 个工作日）
      row('2026-09-14', 10),
      // 异常行（三码叠加；收盘正常 → 下一根跳变可比值）
      row('2026-09-15', 10.5, { open: 10.4, high: 9, low: 10.6, volume: 0 }),
      row('2026-09-16', 20) // 跳变 +90.48%
    ];
    const summary = summarizeSymbolQuality('sh600519', rows, { today: TODAY, autoWindowDays: WINDOW });
    expect(summary.symbol).toBe('sh600519');
    expect(summary.barCount).toBe(4);
    expect(summary.firstDate).toBe('2026-09-03');
    expect(summary.lastDate).toBe('2026-09-16');
    expect(summary.weekdayGaps).toHaveLength(1);
    expect(summary.anomalies).toEqual([
      { tradeDate: '2026-09-15', codes: ['zero_volume', 'high_low_inverted', 'oc_out_of_range'] }
    ]);
    expect(summary.suspiciousJumps).toEqual([{ tradeDate: '2026-09-16', pct: 90.48 }]);
  });

  it('㉓空标的零值', () => {
    const summary = summarizeSymbolQuality('sz300750', [], { today: TODAY, autoWindowDays: WINDOW });
    expect(summary).toEqual({
      symbol: 'sz300750',
      barCount: 0,
      firstDate: null,
      lastDate: null,
      weekdayGaps: [],
      anomalies: [],
      suspiciousJumps: []
    });
  });

  it('㉔outsideAutoWindow：缺口起点早于 today−autoWindowDays 为 true，窗口内为 false', () => {
    const rows = [row('2026-09-03', 10), row('2026-09-14', 10.1)];
    const inside = summarizeSymbolQuality('sh600519', rows, { today: TODAY, autoWindowDays: WINDOW });
    expect(inside.weekdayGaps[0].outsideAutoWindow).toBe('2026-09-03' < cutoff);
    const forcedOld = summarizeSymbolQuality('sh600519', rows, { today: TODAY, autoWindowDays: 1 });
    // 窗口 1 天：缺口必然在窗口外
    expect(forcedOld.weekdayGaps[0].outsideAutoWindow).toBe(true);
    const wideWindow = summarizeSymbolQuality('sh600519', rows, { today: TODAY, autoWindowDays: 3650 });
    expect(wideWindow.weekdayGaps[0].outsideAutoWindow).toBe(false);
  });

  it('㉕缺省 opts：不传 today/autoWindowDays 也能出报表（today=当前时间）', () => {
    const summary = summarizeSymbolQuality('sh600519', NORMAL_WEEK.map((d) => row(d, 10)));
    expect(summary.barCount).toBe(5);
    expect(summary.weekdayGaps).toEqual([]);
  });
});

describe('earliestGapAnchor（最早中段缺口锚点）', () => {
  it('㉖有中段缺口返回缺口前一根日', () => {
    // 09-03 → 09-14 有缺口，锚 = 09-03（缺口前一根，作为拉取窗口扩锚）
    const anchor = earliestGapAnchor(['2026-09-14', '2026-09-03']);
    expect(anchor).toBe('2026-09-03');
  });

  it('㉗无缺口返回 null', () => {
    expect(earliestGapAnchor(NORMAL_WEEK)).toBeNull();
  });

  it('㉘单根/空数组返回 null', () => {
    expect(earliestGapAnchor(['2026-09-14'])).toBeNull();
    expect(earliestGapAnchor([])).toBeNull();
  });

  it('㉙乱序排序后计算；多缺口取最早一处', () => {
    // 两处缺口：09-03→09-14（锚 09-03）与 09-18→09-28（锚 09-18）；取更早的 09-03
    const anchor = earliestGapAnchor(['2026-09-28', '2026-09-14', '2026-09-03', '2026-09-18']);
    expect(anchor).toBe('2026-09-03');
  });

  it('㉚边界缺口恰好 skippedWeekdays=3 也算锚', () => {
    // 09-15(二) → 09-21(一)：跳过 16(三)/17(四)/18(五) 恰 3 天
    expect(earliestGapAnchor(['2026-09-15', '2026-09-21'])).toBe('2026-09-15');
  });
});
