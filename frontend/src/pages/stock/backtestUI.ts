// 回测报告页展示纯函数（照 dailyBarsUI.ts 先例——口径声明/映射/Tag 元数据/格式化/序列构建抽纯模块，
// 组件内不做格式化逻辑，vitest 由 backtestUI.test.ts 覆盖）。
// 仅 import type：vitest 单测在 node 环境运行，类型引用编译期擦除，不拖入 api/http 的 axios/store 依赖。
import type { BacktestConfig, EquityPoint, SignalAction } from '../../api/backtest';

// ==================== 口径声明区（四条，UI 契约写死，页面置顶必读） ====================

export const BACKTEST_DECLARATION_TITLES: string[] = [
  '① 复权口径（前复权 qfq）',
  '② 涨跌停与停牌处理（档位缺口容差）',
  '③ 交易规则与记账时点（T+1）',
  '④ 幸存者偏差与信号边界'
];

// ①原文引用 backend/src/common/entities/stock-daily-bar.entity.ts:2-7 的复权口径声明；
// ②比率口径 + limitEps 5e-3 档位缺口容差 + 局限/偏差方向/阈值单一性如实声明（方案 v3 改写）；
// ③T+1 与记账时点（T 日净值已反映次日开盘成交）；④幸存者偏差与演示信号边界。
export const BACKTEST_DECLARATIONS: string[] = [
  '复权口径（原文引用日线库实体声明 stock-daily-bar.entity.ts）：OHLC 四列存前复权价（qfq，与行情软件同口径）——'
    + '上游仅东财主源满足完整口径（东财 fqt=1 前复权且成交额真实），腾讯 qfqday 前复权但 amount 恒 0、'
    + '新浪公开接口不复权且 amount 恒 0，降级命中腾讯/新浪时由服务层门禁拦截不写库；'
    + 'volume(手)/amount(元) 为原始口径不复权。回测仅消费 OHLC 前复权列，volume/amount 仅用于停牌判定'
    + '（volume=0）与成交额参考，不参与价格计算。',
  '涨跌停与停牌处理：按比率口径判定（次日开盘价/前一日收盘 − 1），涨停阈值参数化默认 10%（跌停默认 −10%），'
    + '并带档位缺口容差 limitEps（默认 5e-3）——交易所涨停价 = round(前收×(1+阈值), 0.01)，四舍五入使真实涨停比率'
    + '可低于名义阈值（实算 prevClose 3.01 → 比率 0.099668、2.52 → 0.099206），该比率在前复权缩放下不变、'
    + '但不消除低价档位缺口；eps=5e-3 覆盖原始价 ≥1 元的全部档位，<1 元的极端档位（A 股正常交易不存在）仍可能漏判。'
    + '偏差方向：容差用于消除可成交性虚高（低价一字板漏判会让不可成交的成交入账，属收益虚高的方向性错误）；'
    + 'eps 边界带内被放弃的交易（真实未封死的 ±9.5%~10% 开盘）对收益的影响方向不定、不承诺单调偏差。'
    + '开盘一字涨停不买、一字跌停不卖，触发即整笔放弃、不递延 T+2；T+1 无 K 线或 volume=0（停牌占位）'
    + '视为停牌跳过，同样不递延。阈值单一性：limitUpPct 为请求级单一阈值，不区分板块与历史制度——'
    + '创业板 2020-08-24 前 10%/后 20%、科创板 20%、ST 5%、北交所 30%，跨期/跨板块回测固定 10% '
    + '存在系统性偏差，与幸存者偏差同类。',
  '交易规则与记账时点：T 日信号于 T+1 开盘价成交（滑点方向：买贵卖便宜）；买入成交当日不可卖，'
    + '次一交易日方可卖出（T+1）；卖出为一次性清仓全部持仓，同日多信号按输入顺序逐条撮合'
    + '（内核不重排，「先卖后买腾出资金」由信号方保证输入顺序）。'
    + '记账时点：T 日净值 = T+1 开盘成交结算后的现金 + 持仓 × T 日收盘，即 T 日净值已反映次日开盘成交；'
    + '停牌日无 K 线不产生净值点（净值序列与 K 线序列逐日对齐）。',
  '幸存者偏差与信号边界：仅对当前自选/候选池存量标的回测，未包含已退市标的，结果整体偏乐观，'
    + '不构成策略有效性结论。信号为服务端内置 MA5/MA20 双均线交叉演示（仅用于验证撮合内核正确性），'
    + 'HTTP 层不接受外部信号数组、从结构上杜绝未来函数；数据为日线行情库前复权 K 线，'
    + '质量瑕疵（缺口/异常行）会原样进入回测，建议先在「数据质量」Tab 探针后再回测。'
];

// ==================== 代码校验 ====================

// 与后端 RunBacktestDto 正则一致：半角小写 ^(sh|sz)\d{6}$（大写/全角 422）
export const SYMBOL_PATTERN = /^(sh|sz)\d{6}$/;

// ==================== skipReason 映射与 Tag 元数据 ====================

export interface SkipReasonTagMeta {
  color: 'orange' | 'default' | 'gold' | 'blue' | 'purple';
  text: string;
}

// skipReason 中文映射（与后端 SkipReason 九码一致）
export const SKIP_REASON_LABELS: Record<string, string> = {
  limit_up: '一字涨停未买',
  limit_down: '一字跌停未卖',
  suspended: '停牌',
  no_next_bar: '无次日K线',
  t_plus_1: 'T+1 不可卖',
  already_holding: '已持仓,买入忽略',
  no_position: '空仓,卖出忽略',
  insufficient_funds: '资金不足',
  atr_unavailable: 'ATR 不可用'
};

// 未知码兜底回显原码（后端新增码而前端未同步映射时不至于显示空白，照 dailyBarsUI anomalyLabel 先例）
export const skipReasonLabel = (reason: string): string => SKIP_REASON_LABELS[reason] ?? reason;

// skipReason → Tag 元数据：一字板橙（可成交性被口径拦截）/ 停牌与无次日灰 / T+1 金 / 规则性忽略蓝 / 资金与 ATR 紫；
// 未知码灰色（antd status 预设 'default'）兜底回显原码。
export const skipReasonTagMeta = (reason: string): SkipReasonTagMeta => {
  const known: Partial<Record<string, SkipReasonTagMeta>> = {
    limit_up: { color: 'orange', text: skipReasonLabel('limit_up') },
    limit_down: { color: 'orange', text: skipReasonLabel('limit_down') },
    suspended: { color: 'default', text: skipReasonLabel('suspended') },
    no_next_bar: { color: 'default', text: skipReasonLabel('no_next_bar') },
    t_plus_1: { color: 'gold', text: skipReasonLabel('t_plus_1') },
    already_holding: { color: 'blue', text: skipReasonLabel('already_holding') },
    no_position: { color: 'blue', text: skipReasonLabel('no_position') },
    insufficient_funds: { color: 'purple', text: skipReasonLabel('insufficient_funds') },
    atr_unavailable: { color: 'purple', text: skipReasonLabel('atr_unavailable') }
  };
  return known[reason] ?? { color: 'default', text: skipReasonLabel(reason) };
};

// 信号动作 → 中文（A 股语义：买入红 / 卖出绿，与 text-stock-up/down 同向）
export const ACTION_LABELS: Record<SignalAction, string> = {
  buy: '买入',
  sell: '卖出'
};

// ==================== 格式化（null/非有限值 → '--'） ====================

// 比率 → 带符号百分比两位小数（收益类指标）：null → '--'，0 → '0.00%'，0.1234 → '+12.34%'，-0.63 → '-63.00%'
export const fmtPct = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) {
    return '--';
  }
  const pct = v * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
};

// 比率 → 无符号百分比两位小数（胜率/换手等非收益语义，不带正负号）
export const fmtPctPlain = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) {
    return '--';
  }
  return `${(v * 100).toFixed(2)}%`;
};

// 比率 → 固定四位小数（阈值/容差/费率等小量级参数）：0.005 → '0.0050'
export const fmtRatio = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) {
    return '--';
  }
  return v.toFixed(4);
};

// 金额 → 千分位两位小数：100000 → '100,000.00'
export const fmtMoney = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) {
    return '--';
  }
  const sign = v < 0 ? '-' : '';
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
};

// 通用数值 → 两位小数（成交价/夏普/盈亏比等）：11 → '11.00'
export const fmtNum = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) {
    return '--';
  }
  return v.toFixed(2);
};

// ==================== 生效参数回显 ====================

// BacktestConfig 回显 → 单行摘要（口径声明区直接展示实际生效参数）
export const formatConfigSummary = (config: BacktestConfig): string => {
  const c = config.cost;
  return [
    `初始资金 ${fmtMoney(config.initialCash)}`,
    `涨停阈值 ${fmtPct(config.limitUpPct)}`,
    `跌停阈值 ${fmtPct(config.limitDownPct)}`,
    `档位容差 ${fmtRatio(config.limitEps)}`,
    `佣金 ${fmtRatio(c.commissionRate)}（最低 ${fmtMoney(c.minCommission)}）`,
    `印花税 ${fmtRatio(c.stampTaxRate)}`,
    `滑点 ${fmtRatio(c.slippageRate)}`
  ].join(' · ');
};

// ==================== 图表序列构建（净值/回撤双图数据源） ====================

// 净值归一化序列：equity/initialCash；initialCash 非正或空曲线 → []（后端约束 initialCash>0，此为防御）
export const buildNetValueSeries = (curve: EquityPoint[], initialCash: number): number[] => {
  if (!curve.length || !initialCash || initialCash <= 0) {
    return [];
  }
  return curve.map((point) => point.equity / initialCash);
};

// 回撤序列：1 − E_t/peak（peak 为截至当日的运行峰值权益）；空曲线 → []，peak 非正时该点记 0
export const buildDrawdownSeries = (curve: EquityPoint[]): number[] => {
  const out: number[] = [];
  let peak = curve.length > 0 ? curve[0].equity : 0;
  for (const point of curve) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    out.push(peak > 0 ? 1 - point.equity / peak : 0);
  }
  return out;
};
