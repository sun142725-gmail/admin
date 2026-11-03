// 回测报告页展示纯函数单测（vitest 显式 import，照 dailyBarsUI.test.ts 头部范式；
// vite.config.mts 无 test 配置段=默认无 globals，必须显式 import { describe, expect, it }）：
// 覆盖口径声明四条数与关键词（复权/涨跌停/档位缺口/停牌/T+1/幸存者偏差/板块）、symbol 正则、
// skipReason 九码映射与未知兜底、格式化边界（null/'--'/正负号/千分位）、生效参数摘要、净值/回撤序列构建。
import { describe, expect, it } from 'vitest';
import {
  ACTION_LABELS,
  BACKTEST_DECLARATION_TITLES,
  BACKTEST_DECLARATIONS,
  SKIP_REASON_LABELS,
  SYMBOL_PATTERN,
  buildDrawdownSeries,
  buildNetValueSeries,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtPctPlain,
  fmtRatio,
  formatConfigSummary,
  skipReasonLabel,
  skipReasonTagMeta
} from './backtestUI';

describe('BACKTEST_DECLARATIONS 口径声明区', () => {
  it('共四条且标题一一对应', () => {
    expect(BACKTEST_DECLARATIONS).toHaveLength(4);
    expect(BACKTEST_DECLARATION_TITLES).toHaveLength(4);
    BACKTEST_DECLARATIONS.forEach((text) => {
      expect(text.length).toBeGreaterThan(0);
    });
  });

  it('UI 契约关键词全部齐备：复权/涨跌停/档位缺口/停牌/T+1/幸存者偏差/板块', () => {
    const joined = BACKTEST_DECLARATIONS.join('');
    expect(joined).toContain('复权');
    expect(joined).toContain('涨跌停');
    expect(joined).toContain('档位缺口');
    expect(joined).toContain('停牌');
    expect(joined).toContain('T+1');
    expect(joined).toContain('幸存者偏差');
    expect(joined).toContain('板块');
  });

  it('①复权口径：引用前复权 qfq 与原始口径声明', () => {
    expect(BACKTEST_DECLARATIONS[0]).toContain('前复权');
    expect(BACKTEST_DECLARATIONS[0]).toContain('qfq');
    expect(BACKTEST_DECLARATIONS[0]).toContain('原始口径');
  });

  it('②涨跌停/停牌：档位缺口容差 5e-3、不递延、round 档位、偏差方向声明', () => {
    const text = BACKTEST_DECLARATIONS[1];
    expect(text).toContain('5e-3');
    expect(text).toContain('round(前收×(1+阈值), 0.01)');
    expect(text).toContain('不递延');
    expect(text).toContain('方向不定');
  });

  it('③交易规则：T+1、先卖后买、记账时点声明', () => {
    const text = BACKTEST_DECLARATIONS[2];
    expect(text).toContain('T+1');
    expect(text).toContain('先卖后买');
    expect(text).toContain('记账时点');
  });

  it('④幸存者偏差：未含已退市、不构成策略有效性结论', () => {
    const text = BACKTEST_DECLARATIONS[3];
    expect(text).toContain('幸存者偏差');
    expect(text).toContain('已退市');
    expect(text).toContain('不构成策略有效性结论');
  });
});

describe('SYMBOL_PATTERN', () => {
  it('半角小写合法代码通过', () => {
    expect(SYMBOL_PATTERN.test('sh600519')).toBe(true);
    expect(SYMBOL_PATTERN.test('sz300750')).toBe(true);
  });

  it('大写/缺前缀/超长/全角拒绝（后端 422 同口径）', () => {
    expect(SYMBOL_PATTERN.test('SH600519')).toBe(false);
    expect(SYMBOL_PATTERN.test('600519')).toBe(false);
    expect(SYMBOL_PATTERN.test('sh6005190')).toBe(false);
    expect(SYMBOL_PATTERN.test('sh６００５１９')).toBe(false);
    expect(SYMBOL_PATTERN.test('bj600519')).toBe(false);
  });
});

describe('SKIP_REASON_LABELS / skipReasonLabel', () => {
  it('九码中文映射全非空', () => {
    const codes = [
      'limit_up',
      'limit_down',
      'suspended',
      'no_next_bar',
      't_plus_1',
      'already_holding',
      'no_position',
      'insufficient_funds',
      'atr_unavailable'
    ];
    expect(Object.keys(SKIP_REASON_LABELS).sort()).toEqual([...codes].sort());
    codes.forEach((code) => {
      expect(skipReasonLabel(code).length).toBeGreaterThan(0);
    });
    expect(skipReasonLabel('limit_up')).toBe('一字涨停未买');
    expect(skipReasonLabel('no_next_bar')).toBe('无次日K线');
  });

  it('未知码兜底回显原码', () => {
    expect(skipReasonLabel('brand_new_code')).toBe('brand_new_code');
  });
});

describe('skipReasonTagMeta', () => {
  it('一字板橙 / 停牌与无次日灰 / T+1 金 / 规则性忽略蓝 / 资金与 ATR 紫', () => {
    expect(skipReasonTagMeta('limit_up')).toEqual({ color: 'orange', text: '一字涨停未买' });
    expect(skipReasonTagMeta('limit_down')).toEqual({ color: 'orange', text: '一字跌停未卖' });
    expect(skipReasonTagMeta('suspended')).toEqual({ color: 'default', text: '停牌' });
    expect(skipReasonTagMeta('no_next_bar')).toEqual({ color: 'default', text: '无次日K线' });
    expect(skipReasonTagMeta('t_plus_1')).toEqual({ color: 'gold', text: 'T+1 不可卖' });
    expect(skipReasonTagMeta('already_holding')).toEqual({ color: 'blue', text: '已持仓,买入忽略' });
    expect(skipReasonTagMeta('no_position')).toEqual({ color: 'blue', text: '空仓,卖出忽略' });
    expect(skipReasonTagMeta('insufficient_funds')).toEqual({ color: 'purple', text: '资金不足' });
    expect(skipReasonTagMeta('atr_unavailable')).toEqual({ color: 'purple', text: 'ATR 不可用' });
  });

  it('未知码灰色兜底回显原码', () => {
    expect(skipReasonTagMeta('mystery_code')).toEqual({ color: 'default', text: 'mystery_code' });
  });
});

describe('ACTION_LABELS', () => {
  it('buy 买入 / sell 卖出', () => {
    expect(ACTION_LABELS).toEqual({ buy: '买入', sell: '卖出' });
  });
});

describe('fmtPct（带符号百分比）', () => {
  it('null/undefined/NaN → --', () => {
    expect(fmtPct(null)).toBe('--');
    expect(fmtPct(undefined)).toBe('--');
    expect(fmtPct(Number.NaN)).toBe('--');
  });

  it('零不带正号，正数带 +，负数带 -，两位小数', () => {
    expect(fmtPct(0)).toBe('0.00%');
    expect(fmtPct(0.1234)).toBe('+12.34%');
    expect(fmtPct(-0.63)).toBe('-63.00%');
    expect(fmtPct(0.001)).toBe('+0.10%');
  });
});

describe('fmtPctPlain（无符号百分比）', () => {
  it('null → --，胜率/换手不带正负号', () => {
    expect(fmtPctPlain(null)).toBe('--');
    expect(fmtPctPlain(0.6)).toBe('60.00%');
    expect(fmtPctPlain(0)).toBe('0.00%');
  });
});

describe('fmtRatio（四位小数）', () => {
  it('null → --，0.005 → 0.0050，0.0003 → 0.0003', () => {
    expect(fmtRatio(null)).toBe('--');
    expect(fmtRatio(0.005)).toBe('0.0050');
    expect(fmtRatio(0.0003)).toBe('0.0003');
  });
});

describe('fmtMoney（千分位两位小数）', () => {
  it('null/NaN → --', () => {
    expect(fmtMoney(null)).toBe('--');
    expect(fmtMoney(Number.NaN)).toBe('--');
  });

  it('零/正数千分位/负数符号', () => {
    expect(fmtMoney(0)).toBe('0.00');
    expect(fmtMoney(100000)).toBe('100,000.00');
    expect(fmtMoney(37000)).toBe('37,000.00');
    expect(fmtMoney(-1234.5)).toBe('-1,234.50');
    expect(fmtMoney(123456789.123)).toBe('123,456,789.12');
  });
});

describe('fmtNum（两位小数）', () => {
  it('null → --，价格/夏普两位小数', () => {
    expect(fmtNum(null)).toBe('--');
    expect(fmtNum(11)).toBe('11.00');
    expect(fmtNum(1.2345)).toBe('1.23');
  });
});

describe('formatConfigSummary 生效参数回显', () => {
  it('包含初始资金/涨跌停阈值/档位容差/佣金/印花税/滑点的格式化值', () => {
    const summary = formatConfigSummary({
      initialCash: 100000,
      limitUpPct: 0.1,
      limitDownPct: -0.1,
      limitEps: 0.005,
      cost: { commissionRate: 0.0003, minCommission: 5, stampTaxRate: 0.0005, slippageRate: 0.001 }
    });
    expect(summary).toContain('初始资金 100,000.00');
    expect(summary).toContain('涨停阈值 +10.00%');
    expect(summary).toContain('跌停阈值 -10.00%');
    expect(summary).toContain('档位容差 0.0050');
    expect(summary).toContain('佣金 0.0003（最低 5.00）');
    expect(summary).toContain('印花税 0.0005');
    expect(summary).toContain('滑点 0.0010');
  });
});

describe('buildNetValueSeries 净值归一化', () => {
  it('equity/initialCash 逐点归一化', () => {
    const curve = [
      { date: 'd1', cash: 100000, shares: 0, close: 10, equity: 100000 },
      { date: 'd2', cash: 1000, shares: 9000, close: 12.1, equity: 109900 }
    ];
    const series = buildNetValueSeries(curve, 100000);
    expect(series).toHaveLength(2);
    expect(series[0]).toBe(1);
    expect(series[1]).toBeCloseTo(1.099, 12);
  });

  it('空曲线或 initialCash 非正 → []（防御）', () => {
    expect(buildNetValueSeries([], 100000)).toEqual([]);
    expect(buildNetValueSeries([{ date: 'd', cash: 1, shares: 0, close: 1, equity: 1 }], 0)).toEqual([]);
  });
});

describe('buildDrawdownSeries 回撤序列', () => {
  it('1 − E/peak（运行峰值），整数比构造精确断言', () => {
    // 峰值 110000：82500 → 1−0.75=0.25；55000 → 1−0.5=0.5（二进制精确）
    const curve = [
      { date: 'd1', cash: 100000, shares: 0, close: 10, equity: 100000 },
      { date: 'd2', cash: 0, shares: 10000, close: 11, equity: 110000 },
      { date: 'd3', cash: 0, shares: 10000, close: 8.25, equity: 82500 },
      { date: 'd4', cash: 0, shares: 10000, close: 5.5, equity: 55000 }
    ];
    expect(buildDrawdownSeries(curve)).toEqual([0, 0, 0.25, 0.5]);
  });

  it('净值创新高时回撤归零；空曲线 → []', () => {
    const curve = [
      { date: 'd1', cash: 100000, shares: 0, close: 10, equity: 100000 },
      { date: 'd2', cash: 50000, shares: 0, close: 10, equity: 50000 },
      { date: 'd3', cash: 120000, shares: 0, close: 10, equity: 120000 }
    ];
    expect(buildDrawdownSeries(curve)).toEqual([0, 0.5, 0]);
    expect(buildDrawdownSeries([])).toEqual([]);
  });
});
