// 策略模拟盘展示纯函数单测（vitest 显式 import，照 backtestUI.test.ts 头部范式；
// vite.config.mts 无 test 配置段=默认无 globals，必须显式 import { describe, expect, it }）：
// 覆盖模板标签四值/参数 schema 范围与默认（含跨参数约束文案）/状态 Tag 映射（含 no_bar）与
// 未知兜底/格式化边界（null/'--'/正负号/千分位）/列表摘要拼装/模拟盘口径声明关键词。
import { describe, expect, it } from 'vitest';
import type { StrategyConfigItem } from '../../api/strategy';
import {
  NO_BAR_SKIP_LABEL,
  NO_BAR_SKIP_REASON,
  PARAM_FIELDS,
  POSITION_STATUS_TAG,
  ROTATION_METRIC_NOTE,
  SIGNAL_STATUS_TAG,
  SIM_DECLARATIONS,
  SIM_DECLARATION_TITLES,
  SINGLE_SYMBOL_TEMPLATES,
  TEMPLATE_CONSTRAINTS,
  TEMPLATE_LABELS,
  TEMPLATE_OPTIONS,
  buildStrategyBriefSummary,
  defaultParamsOf,
  fmtCash,
  fmtPct,
  fmtShares,
  isRotationTemplate,
  strategySkipReasonLabel,
  strategySkipReasonTagMeta,
  templateLabel,
  validateTemplateParams
} from './strategyUI';

describe('TEMPLATE_LABELS 四模板中文名', () => {
  it('四值齐全且非空', () => {
    expect(Object.keys(TEMPLATE_LABELS).sort()).toEqual(
      ['donchian', 'etf-momentum', 'ma-cross', 'macd'].sort()
    );
    expect(TEMPLATE_LABELS['ma-cross']).toBe('双均线交叉');
    expect(TEMPLATE_LABELS.macd).toBe('MACD 交叉');
    expect(TEMPLATE_LABELS.donchian).toBe('唐奇安突破');
    expect(TEMPLATE_LABELS['etf-momentum']).toBe('ETF 动量轮动');
  });

  it('Select 选项与标签一一对应', () => {
    expect(TEMPLATE_OPTIONS).toHaveLength(4);
    expect(TEMPLATE_OPTIONS.map((option) => option.label)).toEqual([
      '双均线交叉',
      'MACD 交叉',
      '唐奇安突破',
      'ETF 动量轮动'
    ]);
  });

  it('templateLabel 未知模板兜底回显原码', () => {
    expect(templateLabel('ma-cross')).toBe('双均线交叉');
    expect(templateLabel('brand_new')).toBe('brand_new');
  });

  it('单标的模板三值 / 轮动判定', () => {
    expect(SINGLE_SYMBOL_TEMPLATES).toEqual(['ma-cross', 'macd', 'donchian']);
    expect(isRotationTemplate('etf-momentum')).toBe(true);
    SINGLE_SYMBOL_TEMPLATES.forEach((template) => {
      expect(isRotationTemplate(template)).toBe(false);
    });
  });
});

describe('PARAM_FIELDS 参数 schema 范围与默认', () => {
  it('ma-cross：fastN [2,60]/5，slowN [3,120]/20，help 非空', () => {
    const fields = PARAM_FIELDS['ma-cross'];
    expect(fields.map((f) => f.name)).toEqual(['fastN', 'slowN']);
    expect(fields[0]).toMatchObject({ min: 2, max: 60, default: 5 });
    expect(fields[1]).toMatchObject({ min: 3, max: 120, default: 20 });
    fields.forEach((field) => {
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.help.length).toBeGreaterThan(0);
      expect(field.min).toBeLessThanOrEqual(field.default);
      expect(field.default).toBeLessThanOrEqual(field.max);
    });
  });

  it('macd：short [2,60]/12，long [3,120]/26，signal [2,60]/9', () => {
    const byName = Object.fromEntries(PARAM_FIELDS.macd.map((f) => [f.name, f]));
    expect(byName.short).toMatchObject({ min: 2, max: 60, default: 12 });
    expect(byName.long).toMatchObject({ min: 3, max: 120, default: 26 });
    expect(byName.signal).toMatchObject({ min: 2, max: 60, default: 9 });
  });

  it('donchian：entryN [5,120]/20，exitN [3,60]/10，atrPeriod [2,60]/14', () => {
    const byName = Object.fromEntries(PARAM_FIELDS.donchian.map((f) => [f.name, f]));
    expect(byName.entryN).toMatchObject({ min: 5, max: 120, default: 20 });
    expect(byName.exitN).toMatchObject({ min: 3, max: 60, default: 10 });
    expect(byName.atrPeriod).toMatchObject({ min: 2, max: 60, default: 14 });
  });

  it('etf-momentum：lookbackN [5,120]/20，holdTop [1,2]/1，rebalanceDays [1,60]/5', () => {
    const byName = Object.fromEntries(PARAM_FIELDS['etf-momentum'].map((f) => [f.name, f]));
    expect(byName.lookbackN).toMatchObject({ min: 5, max: 120, default: 20 });
    expect(byName.holdTop).toMatchObject({ min: 1, max: 2, default: 1 });
    expect(byName.rebalanceDays).toMatchObject({ min: 1, max: 60, default: 5 });
  });

  it('defaultParamsOf 取各字段 default（动态表单回填）', () => {
    expect(defaultParamsOf('ma-cross')).toEqual({ fastN: 5, slowN: 20 });
    expect(defaultParamsOf('macd')).toEqual({ short: 12, long: 26, signal: 9 });
    expect(defaultParamsOf('donchian')).toEqual({ entryN: 20, exitN: 10, atrPeriod: 14 });
    expect(defaultParamsOf('etf-momentum')).toEqual({ lookbackN: 20, holdTop: 1, rebalanceDays: 5 });
  });

  it('跨参数约束文案四模板齐全', () => {
    expect(TEMPLATE_CONSTRAINTS['ma-cross']).toContain('fastN');
    expect(TEMPLATE_CONSTRAINTS.macd).toContain('short');
    expect(TEMPLATE_CONSTRAINTS.donchian).toContain('exitN');
    expect(TEMPLATE_CONSTRAINTS['etf-momentum']).toContain('≥2');
  });

  it('validateTemplateParams：fastN≥slowN / short≥long / exitN>entryN 报错，合法返回 null', () => {
    expect(validateTemplateParams('ma-cross', { fastN: 20, slowN: 5 })).toBe(TEMPLATE_CONSTRAINTS['ma-cross']);
    expect(validateTemplateParams('ma-cross', { fastN: 5, slowN: 20 })).toBeNull();
    expect(validateTemplateParams('macd', { short: 26, long: 12 })).toBe(TEMPLATE_CONSTRAINTS.macd);
    expect(validateTemplateParams('macd', { short: 12, long: 26 })).toBeNull();
    expect(validateTemplateParams('donchian', { entryN: 10, exitN: 20 })).toBe(TEMPLATE_CONSTRAINTS.donchian);
    expect(validateTemplateParams('donchian', { entryN: 20, exitN: 10 })).toBeNull();
    // 边界合法：donchian exitN === entryN
    expect(validateTemplateParams('donchian', { entryN: 20, exitN: 20 })).toBeNull();
    // 参数缺失报错（防御）
    expect(validateTemplateParams('ma-cross', { fastN: 5 })).toBe(TEMPLATE_CONSTRAINTS['ma-cross']);
    // 轮动无跨参数约束（symbols 约束在页面层）
    expect(validateTemplateParams('etf-momentum', {})).toBeNull();
  });
});

describe('SIGNAL_STATUS_TAG 信号状态 Tag', () => {
  it('emitted 金待撮合 / filled 蓝已成交 / skipped 灰已跳过', () => {
    expect(SIGNAL_STATUS_TAG('emitted')).toEqual({ color: 'gold', text: '待撮合' });
    expect(SIGNAL_STATUS_TAG('filled')).toEqual({ color: 'blue', text: '已成交' });
    expect(SIGNAL_STATUS_TAG('skipped')).toEqual({ color: 'default', text: '已跳过' });
  });

  it('未知状态兜底回显原码', () => {
    expect(SIGNAL_STATUS_TAG('mystery')).toEqual({ color: 'default', text: 'mystery' });
  });
});

describe('POSITION_STATUS_TAG 持仓状态 Tag', () => {
  it('flat 灰空仓 / pending_open 金待开仓 / holding 蓝持仓中 / pending_close 橙待平仓', () => {
    expect(POSITION_STATUS_TAG('flat')).toEqual({ color: 'default', text: '空仓' });
    expect(POSITION_STATUS_TAG('pending_open')).toEqual({ color: 'gold', text: '待开仓' });
    expect(POSITION_STATUS_TAG('holding')).toEqual({ color: 'blue', text: '持仓中' });
    expect(POSITION_STATUS_TAG('pending_close')).toEqual({ color: 'orange', text: '待平仓' });
  });

  it('未知状态兜底回显原码', () => {
    expect(POSITION_STATUS_TAG('ghost')).toEqual({ color: 'default', text: 'ghost' });
  });
});

describe('skipReason 组合层扩展码 no_bar', () => {
  it("no_bar 映射「无行情(停牌缺日)」紫标", () => {
    expect(NO_BAR_SKIP_REASON).toBe('no_bar');
    expect(NO_BAR_SKIP_LABEL).toBe('无行情(停牌缺日)');
    expect(strategySkipReasonLabel('no_bar')).toBe('无行情(停牌缺日)');
    expect(strategySkipReasonTagMeta('no_bar')).toEqual({ color: 'purple', text: '无行情(停牌缺日)' });
  });

  it('内核九码透传 backtestUI 映射（limit_up 抽查）', () => {
    expect(strategySkipReasonLabel('limit_up')).toBe('一字涨停未买');
    expect(strategySkipReasonTagMeta('suspended')).toEqual({ color: 'default', text: '停牌' });
  });

  it('未知码兜底回显原码', () => {
    expect(strategySkipReasonLabel('brand_new_code')).toBe('brand_new_code');
    expect(strategySkipReasonTagMeta('brand_new_code')).toEqual({ color: 'default', text: 'brand_new_code' });
  });
});

describe('格式化边界', () => {
  it('fmtCash：null/NaN → --，千分位两位小数，负数符号', () => {
    expect(fmtCash(null)).toBe('--');
    expect(fmtCash(undefined)).toBe('--');
    expect(fmtCash(Number.NaN)).toBe('--');
    expect(fmtCash(0)).toBe('0.00');
    expect(fmtCash(100000)).toBe('100,000.00');
    expect(fmtCash(36806.5)).toBe('36,806.50');
    expect(fmtCash(-1234.5)).toBe('-1,234.50');
  });

  it('fmtPct：null → --，0 无正号，正带 +，负带 -', () => {
    expect(fmtPct(null)).toBe('--');
    expect(fmtPct(0)).toBe('0.00%');
    expect(fmtPct(0.1234)).toBe('+12.34%');
    expect(fmtPct(-0.63)).toBe('-63.00%');
  });

  it('fmtShares：null → --，千分位整数，0 → 0，小数截断为整', () => {
    expect(fmtShares(null)).toBe('--');
    expect(fmtShares(Number.NaN)).toBe('--');
    expect(fmtShares(0)).toBe('0');
    expect(fmtShares(9000)).toBe('9,000');
    expect(fmtShares(-1234)).toBe('-1,234');
    expect(fmtShares(100.4)).toBe('100');
  });
});

describe('buildStrategyBriefSummary 列表摘要', () => {
  const base: StrategyConfigItem = {
    id: 1,
    name: '白酒轮动',
    template: 'etf-momentum',
    enabled: true,
    symbols: ['sh510300', 'sh512100', 'sz159915', 'sh510500'],
    params: { lookbackN: 20, holdTop: 1, rebalanceDays: 5 },
    initialCash: 100000,
    positionModel: null,
    simStartDate: '2024-01-02',
    remark: null
  };

  it('模板/标的/初始资金/起点拼装，标的超 3 个记数', () => {
    const summary = buildStrategyBriefSummary(base);
    expect(summary).toContain('ETF 动量轮动');
    expect(summary).toContain('SH510300 / SH512100 / SZ159915 等 4 个');
    expect(summary).toContain('初始资金 100,000.00');
    expect(summary).toContain('起点 2024-01-02');
  });

  it('空标的降级「未设置标的」，起点空显 --', () => {
    const summary = buildStrategyBriefSummary({ ...base, symbols: [], simStartDate: '' });
    expect(summary).toContain('未设置标的');
    expect(summary).toContain('起点 --');
  });

  it('标的恰 3 个不追加记数', () => {
    const summary = buildStrategyBriefSummary({ ...base, symbols: ['sh510300', 'sh512100', 'sz159915'] });
    expect(summary).toContain('SH510300 / SH512100 / SZ159915');
    expect(summary).not.toContain('等');
  });
});

describe('模拟盘口径声明（r4 扩写两条）', () => {
  it('两条且标题一一对应', () => {
    expect(SIM_DECLARATIONS).toHaveLength(2);
    expect(SIM_DECLARATION_TITLES).toHaveLength(2);
    SIM_DECLARATIONS.forEach((text) => {
      expect(text.length).toBeGreaterThan(0);
    });
  });

  it('⑤ 影子账户：全量重建/不做历史冻结/预热段经济后果计入/净值≠初始资金/信号行不落库', () => {
    const text = SIM_DECLARATIONS[0];
    expect(text).toContain('影子账户');
    expect(text).toContain('全量重建投影');
    expect(text).toContain('不做历史冻结');
    expect(text).toContain('预热段经济后果计入');
    expect(text).toContain('净值≠初始资金');
    expect(text).toContain('不落库');
  });

  it('⑥ 收盘盯市：T+1 开盘成交/库内最新交易日收盘价盯市/顺延下轮不丢日', () => {
    const text = SIM_DECLARATIONS[1];
    expect(text).toContain('T+1 开盘成交');
    expect(text).toContain('收盘价盯市');
    expect(text).toContain('顺延下轮不丢日');
  });

  it('轮动指标口径声明含分组配对', () => {
    expect(ROTATION_METRIC_NOTE).toContain('分组配对');
  });
});
