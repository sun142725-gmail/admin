// 策略模拟盘展示纯函数（照 backtestUI.ts:1-5 范式——标签/参数 schema/Tag 元数据/格式化/摘要拼装
// 抽纯模块，组件内不做格式化逻辑，vitest 由 strategyUI.test.ts 覆盖）。
// 仅 import type 自 api/strategy：vitest 单测在 node 环境运行，类型引用编译期擦除，
// 不拖入 api/http 的 axios/store 依赖；对 backtestUI.ts 的值导入安全（该文件同样仅 import type）。
// 注意：PARAM_FIELDS 与 api/strategy.ts 的 STRATEGY_PARAM_FIELDS 为同源双表，
// 改任一侧必须同步另一侧（两侧均被 strategyUI.test.ts 锁范围与默认值）。
import type { PositionStatus, SignalStatus, StrategyConfigItem, StrategyTemplate } from '../../api/strategy';
import {
  fmtMoney,
  fmtPct,
  skipReasonLabel as baseSkipReasonLabel,
  skipReasonTagMeta as baseSkipReasonTagMeta
} from './backtestUI';
import type { SkipReasonTagMeta } from './backtestUI';

// ==================== 模板标签与选项 ====================

// 四模板中文名（UI 契约写死）
export const TEMPLATE_LABELS: Record<StrategyTemplate, string> = {
  'ma-cross': '双均线交叉',
  macd: 'MACD 交叉',
  donchian: '唐奇安突破',
  'etf-momentum': 'ETF 动量轮动'
};

// 未知模板兜底回显原码（照 skipReasonLabel 先例，后端新增模板前端未同步时不显示空白）
export const templateLabel = (template: string): string =>
  (TEMPLATE_LABELS as Record<string, string>)[template] ?? template;

// 模板 Select 选项（固定四值顺序）
export const TEMPLATE_OPTIONS = (Object.keys(TEMPLATE_LABELS) as StrategyTemplate[]).map((value) => ({
  value,
  label: TEMPLATE_LABELS[value]
}));

// 单标的模板（signals 剥 symbol 映射回内核；symbols 恒恰 1 个）；etf-momentum 为轮动模板（≥2 个）
export const SINGLE_SYMBOL_TEMPLATES: StrategyTemplate[] = ['ma-cross', 'macd', 'donchian'];

export const isRotationTemplate = (template: StrategyTemplate): boolean => template === 'etf-momentum';

// ==================== 参数 schema（驱动动态表单） ====================

export interface StrategyParamFieldUI {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  help: string;
}

// 每模板参数表单 schema：切换模板即按本表重建参数项（InputNumber 带 min/max，默认值回填）。
// 范围/默认与 api/strategy.ts 的 STRATEGY_PARAM_FIELDS 及后端模板注册表三方一致。
export const PARAM_FIELDS: Record<StrategyTemplate, StrategyParamFieldUI[]> = {
  'ma-cross': [
    { name: 'fastN', label: '快线周期 fastN', min: 2, max: 60, default: 5, help: '[2,60]，须 < slowN' },
    { name: 'slowN', label: '慢线周期 slowN', min: 3, max: 120, default: 20, help: '[3,120]，须 > fastN' }
  ],
  macd: [
    { name: 'short', label: '快线 EMA short', min: 2, max: 60, default: 12, help: '[2,60]，须 < long' },
    { name: 'long', label: '慢线 EMA long', min: 3, max: 120, default: 26, help: '[3,120]，须 > short' },
    { name: 'signal', label: 'DEA 周期 signal', min: 2, max: 60, default: 9, help: '[2,60]' }
  ],
  donchian: [
    {
      name: 'entryN',
      label: '入场通道 entryN',
      min: 5,
      max: 120,
      default: 20,
      help: '[5,120]，收盘上穿前 entryN 根最高（不含当日）'
    },
    {
      name: 'exitN',
      label: '离场通道 exitN',
      min: 3,
      max: 60,
      default: 10,
      help: '[3,60]，收盘下穿前 exitN 根最低，须 ≤ entryN'
    },
    { name: 'atrPeriod', label: 'ATR 周期 atrPeriod', min: 2, max: 60, default: 14, help: '[2,60]，ATR 仓位插件回看' }
  ],
  'etf-momentum': [
    { name: 'lookbackN', label: '动量回看 lookbackN', min: 5, max: 120, default: 20, help: '[5,120]，动量分回看交易日数' },
    { name: 'holdTop', label: '持仓前 N holdTop', min: 1, max: 2, default: 1, help: '[1,2]，按动量排名等权分槽' },
    {
      name: 'rebalanceDays',
      label: '调仓周期 rebalanceDays',
      min: 1,
      max: 60,
      default: 5,
      help: '[1,60]，基准日历交易日序数取模'
    }
  ]
};

// 模板默认参数（动态表单回填用，取 PARAM_FIELDS 各项 default）
export const defaultParamsOf = (template: StrategyTemplate): Record<string, number> =>
  Object.fromEntries(PARAM_FIELDS[template].map((field) => [field.name, field.default]));

// 跨参数约束文案（提交前前端同口径校验的提示语，与后端 validateParams 一致）
export const TEMPLATE_CONSTRAINTS: Record<StrategyTemplate, string> = {
  'ma-cross': 'fastN 必须 < slowN',
  macd: 'short 必须 < long',
  donchian: 'exitN 必须 ≤ entryN',
  'etf-momentum': '轮动模板标的须 ≥2 个且 ≤8 个'
};

// 跨参数约束校验（前端提交前同口径前置提示，与后端模板 validateParams 一致；InputNumber 只拦单字段
// min/max，fastN<slowN 等跨字段关系在此拦）。返回错误文案，合法返回 null。
export const validateTemplateParams = (
  template: StrategyTemplate,
  params: Record<string, number>
): string | null => {
  const has = (...names: string[]) => names.every((name) => Number.isFinite(params[name]));
  if (template === 'ma-cross') {
    if (!has('fastN', 'slowN') || params.fastN >= params.slowN) {
      return TEMPLATE_CONSTRAINTS[template];
    }
    return null;
  }
  if (template === 'macd') {
    if (!has('short', 'long') || params.short >= params.long) {
      return TEMPLATE_CONSTRAINTS[template];
    }
    return null;
  }
  if (template === 'donchian') {
    if (!has('entryN', 'exitN') || params.exitN > params.entryN) {
      return TEMPLATE_CONSTRAINTS[template];
    }
    return null;
  }
  return null;
};

// ==================== 状态 Tag 映射（未知值兜底回显原码） ====================

export interface StatusTagMeta {
  color: string;
  text: string;
}

// 信号状态：emitted 金「待撮合」/ filled 蓝「已成交」/ skipped 灰「已跳过」。
// emitted 仅作防御态：正常重放下不可达——最新 bar 日的信号在状态机折叠时恒配对 no_next_bar
// skip 落库为 skipped（口径=顺延下轮撮合），故生产数据看到的灰「已跳过」应读作「顺延」。
export const SIGNAL_STATUS_TAG = (status: string): StatusTagMeta => {
  const known: Record<SignalStatus, StatusTagMeta> = {
    emitted: { color: 'gold', text: '待撮合' },
    filled: { color: 'blue', text: '已成交' },
    skipped: { color: 'default', text: '已跳过' }
  };
  return (known as Record<string, StatusTagMeta>)[status] ?? { color: 'default', text: status };
};

// 持仓状态：flat 灰「空仓」/ pending_open 金「待开仓」/ holding 蓝「持仓中」/ pending_close 橙「待平仓」
export const POSITION_STATUS_TAG = (status: string): StatusTagMeta => {
  const known: Record<PositionStatus, StatusTagMeta> = {
    flat: { color: 'default', text: '空仓' },
    pending_open: { color: 'gold', text: '待开仓' },
    holding: { color: 'blue', text: '持仓中' },
    pending_close: { color: 'orange', text: '待平仓' }
  };
  return (known as Record<string, StatusTagMeta>)[status] ?? { color: 'default', text: status };
};

// ==================== skipReason（内核九码透传 + 组合层扩展码 no_bar） ====================

// 组合层扩展码：no_bar=信号日该标的无 bar 行（真实停牌常整行缺失），重放器显式记录不静默丢弃；
// volume=0 占位行的停牌仍走内核 suspended 码。UI 契约写死中文「无行情(停牌缺日)」。
export const NO_BAR_SKIP_REASON = 'no_bar';
export const NO_BAR_SKIP_LABEL = '无行情(停牌缺日)';

export const strategySkipReasonLabel = (reason: string): string =>
  reason === NO_BAR_SKIP_REASON ? NO_BAR_SKIP_LABEL : baseSkipReasonLabel(reason);

// no_bar 紫标（组合层扩展码，与内核九码色系区分）；其余九码照 backtestUI 色系，未知码灰兜底
export const strategySkipReasonTagMeta = (reason: string): SkipReasonTagMeta =>
  reason === NO_BAR_SKIP_REASON
    ? { color: 'purple', text: NO_BAR_SKIP_LABEL }
    : baseSkipReasonTagMeta(reason);

// ==================== 格式化（null/非有限值 → '--'） ====================

// 比率 → 带符号百分比（复用 backtestUI 同一口径）
export { fmtPct };

// 金额 → 千分位两位小数（与 backtestUI.fmtMoney 同一口径；照契约命名 fmtCash）
export const fmtCash = fmtMoney;

// 股数 → 千分位整数：9000 → '9,000'，0 → '0'，null/非有限 → '--'
export const fmtShares = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) {
    return '--';
  }
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// ==================== 列表摘要与口径声明 ====================

// 列表卡片摘要行：模板中文名 · 标的（至多 3 个，超出记数） · 初始资金 · 重放起点
export const buildStrategyBriefSummary = (config: StrategyConfigItem): string => {
  const symbols = Array.isArray(config.symbols) ? config.symbols : [];
  const shown = symbols.slice(0, 3).map((symbol) => symbol.toUpperCase()).join(' / ');
  const more = symbols.length > 3 ? ` 等 ${symbols.length} 个` : '';
  return [
    templateLabel(config.template),
    shown ? `${shown}${more}` : '未设置标的',
    `初始资金 ${fmtCash(config.initialCash)}`,
    `起点 ${config.simStartDate || '--'}`
  ].join(' · ');
};

// 模拟盘口径声明标题（回测报告 Drawer 口径声明区追加两条，r4 扩写；编号接 backtestUI 四条之后）
export const SIM_DECLARATION_TITLES: string[] = ['⑤ 影子账户重放语义', '⑥ 日线收盘盯市'];

// ⑤ r4 扩写：影子账户重放语义（改配置全量重建/不做历史冻结/预热段经济后果计入/预热段信号行不落库）；
// ⑥ 日线收盘盯市（T+1 开盘成交/库内最新交易日收盘价盯市/未落库顺延不丢日）。
export const SIM_DECLARATIONS: string[] = [
  '影子账户重放语义：模拟盘是策略当前配置的影子账户——每次调度/手动运行把启用策略从「固定锚预热段+'
    + '正式段」窗口重喂「信号函数→撮合」并全量重建投影（同数据同参数结果确定，同日重跑幂等）；'
    + '改参数/换标的池/改起点后，下一轮按新口径全量重建投影，不做历史冻结。预热段经济后果计入：'
    + '持仓 last_buy_date/avg_cost 可早于重放起点（预热段建仓），账户在正式段起点净值≠初始资金'
    + '（含预热段盈亏）；预热段信号行不落库，信号 Tab 不可见（其经济后果仍在持仓与账户中）。',
  '日线收盘盯市：T 日信号 T+1 开盘成交（滑点买贵卖便宜、佣金/印花税、比率涨跌停与停牌判定，'
    + '与回测内核同一条撮合路径）；每轮重放至库内最新 bar 后，持仓与账户以库内最新交易日收盘价盯市，'
    + '净值=现金+Σ持仓市值；当日 K 线未落库时重放以库内最新 bar 为界，该日信号/盯市顺延下轮不丢日。'
];

// 轮动模式指标卡口径声明行（§1.3 分组配对：交错成交不跨标的错配）
export const ROTATION_METRIC_NOTE =
  '回合口径：轮动策略胜率/盈亏比/回合数按标的分组配对计算（多标的交错成交不跨标的错配）。';
