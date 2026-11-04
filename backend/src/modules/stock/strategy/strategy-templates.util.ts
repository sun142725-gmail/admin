// 策略模板注册表（方案 §1.2）：四模板信号纯函数 + 参数校验 + 注册表。
// 全部无 I/O、不依赖 Nest 容器、不 import @nestjs/*。
// 因果性声明：每个 generateSignals 第 i 根的判定只读 bars[0..i]（sma/macd 为滑动/递推因果实现，
// donchian 通道取「前 N 根不含当日」），防未来函数；单测专列反证（strategy-donchian.spec.ts）。
import { Bar } from '../backtest/backtest.types';
import { maCrossDemoSignals } from '../backtest/backtest-demo-signal.util';
import { macd } from '../indicators.util';
import { sma } from '../indicators.util';
import {
  StrategyDefinition,
  StrategyInput,
  StrategySignal,
  StrategyTemplate
} from './strategy.types';

// ---------- 公共小工具（模板间共用，纯函数） ----------

/** 单标的模板取唯一标的 bars：barsBySymbol 恒单键（服务层保证），防御性取首键。 */
const singleBars = (input: StrategyInput): Bar[] => {
  const keys = Object.keys(input.barsBySymbol);
  return keys.length > 0 ? input.barsBySymbol[keys[0]] : [];
};

/** 整数参数校验：NaN/非整数/越界均报错（N=周期类参数必须是正整数）。 */
const intInRange = (
  errors: string[],
  params: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): number | null => {
  const raw = params[key];
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (raw === undefined || raw === null || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`参数 ${key} 必须为 [${min}, ${max}] 内的整数`);
    return null;
  }
  return value;
};

/** 键集白名单校验：params 出现模板未定义的键即报错（禁止借 params 注入非模板键）。 */
const checkUnknownKeys = (
  errors: string[],
  params: Record<string, unknown>,
  whitelist: string[]
): void => {
  for (const key of Object.keys(params)) {
    if (!whitelist.includes(key)) {
      errors.push(`未知参数键 ${key}（模板参数白名单：${whitelist.join(', ')}）`);
    }
  }
};

// ---------- ① ma-cross 双均线 ----------

/**
 * 双均线交叉（方案 §1.2①）：fastN=5[2,60]、slowN=20[3,120]，约束 fastN<slowN。
 * 判定式与 backtest-demo-signal.util.ts:25-30 逐字一致（直接参数化包装既有实现，不重写）。
 * minBars=2：i≥1 循环的结构下限；更长预热由 sma 空值自然吞掉（无信号，非错误）。
 */
export const maCrossStrategy: StrategyDefinition = {
  template: 'ma-cross',
  label: '双均线交叉',
  singleSymbol: true,
  minBars: 2,
  defaultParams: { fastN: 5, slowN: 20 },
  defaultPositionModel: { type: 'all-in' },
  validateParams(params) {
    const errors: string[] = [];
    checkUnknownKeys(errors, params, ['fastN', 'slowN']);
    const fastN = intInRange(errors, params, 'fastN', 2, 60);
    const slowN = intInRange(errors, params, 'slowN', 3, 120);
    if (fastN != null && slowN != null && fastN >= slowN) {
      errors.push('参数 fastN 必须小于 slowN');
    }
    return errors;
  },
  generateSignals(input) {
    const bars = singleBars(input);
    if (bars.length < maCrossStrategy.minBars) {
      return [];
    }
    const fastN = Number(input.params.fastN);
    const slowN = Number(input.params.slowN);
    // 复用内核演示信号（判定式逐字一致），映射为带 symbol 的 StrategySignal。
    return maCrossDemoSignals(bars, fastN, slowN).map((signal) => ({
      date: signal.date,
      symbol: singleBarsSymbol(input),
      action: signal.action
    }));
  }
};

/** 单标的模板的标的键（barsBySymbol 唯一键；空表兜底空串——调用方在服务层保证非空）。 */
const singleBarsSymbol = (input: StrategyInput): string => Object.keys(input.barsBySymbol)[0] ?? '';

// ---------- ② macd ----------

/**
 * MACD 金叉死叉（方案 §1.2②）：short=12[2,60]、long=26[3,120]、signal=9[2,60]，约束 short<long。
 * 消费 indicators.util.macd 的 {dif, dea, histogram} 字段（字段名照 indicators.util.ts:61-80 原样）。
 * i≥1：prevDif<=prevDea && dif>dea → buy，反向 → sell；零值/空序列无信号。
 */
export const macdStrategy: StrategyDefinition = {
  template: 'macd',
  label: 'MACD 交叉',
  singleSymbol: true,
  minBars: 2,
  defaultParams: { short: 12, long: 26, signal: 9 },
  defaultPositionModel: { type: 'all-in' },
  validateParams(params) {
    const errors: string[] = [];
    checkUnknownKeys(errors, params, ['short', 'long', 'signal']);
    const short = intInRange(errors, params, 'short', 2, 60);
    const long = intInRange(errors, params, 'long', 3, 120);
    intInRange(errors, params, 'signal', 2, 60);
    if (short != null && long != null && short >= long) {
      errors.push('参数 short 必须小于 long');
    }
    return errors;
  },
  generateSignals(input) {
    const bars = singleBars(input);
    if (bars.length < macdStrategy.minBars) {
      return [];
    }
    const closes = bars.map((bar) => bar.close);
    const { dif, dea } = macd(
      closes,
      Number(input.params.short),
      Number(input.params.long),
      Number(input.params.signal)
    );
    const signals: StrategySignal[] = [];
    for (let i = 1; i < bars.length; i += 1) {
      const prevDif = dif[i - 1];
      const prevDea = dea[i - 1];
      const currDif = dif[i];
      const currDea = dea[i];
      if (prevDif == null || prevDea == null || currDif == null || currDea == null) {
        continue;
      }
      if (prevDif <= prevDea && currDif > currDea) {
        signals.push({ date: bars[i].date, symbol: singleBarsSymbol(input), action: 'buy' });
      } else if (prevDif >= prevDea && currDif < currDea) {
        signals.push({ date: bars[i].date, symbol: singleBarsSymbol(input), action: 'sell' });
      }
    }
    return signals;
  }
};

// ---------- ③ donchian 唐奇安突破 ----------

/**
 * 唐奇安通道突破（方案 §1.2③）：entryN=20[5,120]、exitN=10[3,60]、atrPeriod=14[2,60]，约束 exitN<=entryN。
 * 突破日 = 收盘上穿「前 entryN 根（不含当日）」最高价 → buy；跌破「前 exitN 根」最低价 → sell。
 * 当日高点进通道即未来函数——通道窗必须 excl 当日（单测反证锁定）。
 * ATR 仓位不在信号函数：position_model={type:'atr'} 由撮合层 atrModel 折算预算，信号只给方向。
 */
export const donchianStrategy: StrategyDefinition = {
  template: 'donchian',
  label: '唐奇安突破',
  singleSymbol: true,
  minBars: 2,
  defaultParams: { entryN: 20, exitN: 10, atrPeriod: 14 },
  // donchian 默认走 ATR 风险仓位（atrPeriod 与模板参数同源，服务层 defaultPositionModelFor 落地）
  defaultPositionModel: { type: 'atr', riskPct: 0.01, maxPositionPct: 1, atrPeriod: 14 },
  validateParams(params) {
    const errors: string[] = [];
    checkUnknownKeys(errors, params, ['entryN', 'exitN', 'atrPeriod']);
    const entryN = intInRange(errors, params, 'entryN', 5, 120);
    const exitN = intInRange(errors, params, 'exitN', 3, 60);
    intInRange(errors, params, 'atrPeriod', 2, 60);
    if (entryN != null && exitN != null && exitN > entryN) {
      errors.push('参数 exitN 必须小于等于 entryN');
    }
    return errors;
  },
  generateSignals(input) {
    const bars = singleBars(input);
    if (bars.length < donchianStrategy.minBars) {
      return [];
    }
    const entryN = Number(input.params.entryN);
    const exitN = Number(input.params.exitN);
    const symbol = singleBarsSymbol(input);
    const signals: StrategySignal[] = [];
    for (let i = 1; i < bars.length; i += 1) {
      // 通道窗 = [i-entryN, i-1] / [i-exitN, i-1]：不含当日（i 自 1 起，i-entryN<0 时窗口不完整无信号）。
      if (i >= entryN) {
        let entryHigh = -Infinity;
        for (let j = i - entryN; j <= i - 1; j += 1) {
          entryHigh = Math.max(entryHigh, bars[j].high);
        }
        if (bars[i].close > entryHigh) {
          signals.push({ date: bars[i].date, symbol, action: 'buy' });
          continue;
        }
      }
      if (i >= exitN) {
        let exitLow = Infinity;
        for (let j = i - exitN; j <= i - 1; j += 1) {
          exitLow = Math.min(exitLow, bars[j].low);
        }
        if (bars[i].close < exitLow) {
          signals.push({ date: bars[i].date, symbol, action: 'sell' });
        }
      }
    }
    return signals;
  }
};

// ---------- ④ etf-momentum ETF 动量轮动 ----------
// 已知局限（轮动模板特有，单标的模板无此问题）：虚拟持仓由本模板自己产出过的信号推演
// （无外部状态），买入被撮合层 skip（limit_up/suspended/no_bar）后不会在下一调仓日重发 buy，
// 「目标持仓 vs 实际持仓」永不复核——影子持仓与现实脱节时组合空仓滞留整个轮动周期，
// 直到该标的跌出目标排名才发 sell（再被 no_position skip，状态机 flat×sell_emitted→flat 已兜住）。
// 行为确定且回测/模拟盘一致，属口径取舍而非缺陷；解读结果时注意该空窗放大效应。

/**
 * ETF 动量轮动（方案 §1.2④，多标的、日期键控）：lookbackN=20[5,120]、holdTop=1[1,2]、rebalanceDays=5[1,60]。
 * - 轮动日历 = symbols[0]（基准标的）的日期序列；跨标的取数一律按「日期键」查各自映射，
 *   禁止按下标对齐（同下标在日期集错位时取到不同日期的收盘=隐性错日/未来函数，单测反证锁定）。
 * - 调仓日（锚定回退语义）：锚日=max(input.simStartDate, 基准日历窗口首日)；调仓日=基准日历上
 *   「日期≥锚日的交易日序数(0 起) % rebalanceDays === 0」。
 *   常态：窗口锚点固定（模拟盘锚=库内最早 bar 与 sim_start_date 前推预热的大者≤sim_start_date）
 *   →锚日=simStartDate，预热根数/窗口起点变化不引起调仓日相位跳变（锚定反证用例锁定）；
 *   回退：窗口首日晚于 simStartDate（回测端点 limit 截断 / 新上市 ETF 数据起点晚）时以窗口首日
 *   重锚定（序数 0）——回退是输入的纯函数，同输入同结果（锚定回退反证用例锁定相位差异）。
 * - 动量分 score_s(d)=close_s(d)/close_s(d0)−1，d0=基准日历上 d 的前 lookbackN 个交易日；
 *   close_s(d)/close_s(d0) 在 symbol s 自己的日期映射按键查找，任一缺失或除零 → -Infinity 排除。
 * - 排序取前 holdTop；并列按 symbol 字典序升序（确定性）；目标空或最高分<=0 → 空仓；
 *   先对「已持有∉目标」逐个 sell（字典序），再对「目标∉已持有」按排名序 buy（同日先卖后买腾资金，
 *   照内核「先卖后买由输入顺序表达」口径 backtest-match.util.ts:46-53）；同标的同日不产生双向信号。
 * - 停牌兜底：volume=0 占位行由撮合层 suspended skip 覆盖；真实停牌整行缺失时信号日不在该标的
 *   bar 序列，由组合重放器生成显式 no_bar skip 记录（§1.3），不静默丢弃。
 */
export const etfMomentumStrategy: StrategyDefinition = {
  template: 'etf-momentum',
  label: 'ETF 动量轮动',
  singleSymbol: false,
  // 结构下限：lookbackN 默认 20 + 基准日 1（更小 lookbackN 仍可用，minBars 仅是模板级地板）
  minBars: 21,
  defaultParams: { lookbackN: 20, holdTop: 1, rebalanceDays: 5 },
  // 等权分槽：ratio=1/holdTop 由服务层 defaultPositionModelFor 按 holdTop 参数落地（此处为 holdTop=1 缺省）
  defaultPositionModel: { type: 'fixed-ratio', ratio: 1 },
  validateParams(params) {
    const errors: string[] = [];
    checkUnknownKeys(errors, params, ['lookbackN', 'holdTop', 'rebalanceDays']);
    intInRange(errors, params, 'lookbackN', 5, 120);
    intInRange(errors, params, 'holdTop', 1, 2);
    intInRange(errors, params, 'rebalanceDays', 1, 60);
    return errors;
  },
  generateSignals(input) {
    const symbols = Object.keys(input.barsBySymbol);
    const baseBars = symbols.length > 0 ? input.barsBySymbol[symbols[0]] : [];
    if (baseBars.length < etfMomentumStrategy.minBars) {
      return [];
    }
    const lookbackN = Number(input.params.lookbackN);
    const holdTop = Number(input.params.holdTop);
    const rebalanceDays = Number(input.params.rebalanceDays);

    // 各标的自有日期→收盘映射（日期键控取数，唯一合法通道）
    const closeByKey = new Map<string, Map<string, number>>();
    for (const symbol of symbols) {
      closeByKey.set(
        symbol,
        new Map(input.barsBySymbol[symbol].map((bar) => [bar.date, bar.close]))
      );
    }

    const calendar = baseBars.map((bar) => bar.date);
    // 锚日 = max(simStartDate, 基准日历窗口首日)（字典序即日期序，YYYY-MM-DD 半角格式可比）
    const firstDate = calendar[0];
    const anchor = input.simStartDate > firstDate ? input.simStartDate : firstDate;
    // 窗口首序数：首个 >= 锚日的下标（anchor < 首日时为 0；anchor 落在日历空洞时取后一个交易日）
    let firstOrdinalIdx = calendar.findIndex((date) => date >= anchor);
    if (firstOrdinalIdx < 0) {
      firstOrdinalIdx = calendar.length; // 整个窗口早于锚日（理论不可达：anchor≤首日或=首日后某日）→ 无调仓日
    }

    // 已持有集合：由本函数已产出的 buy/sell 信号推演（信号函数无外部状态）
    const holdings = new Set<string>();
    const signals: StrategySignal[] = [];

    for (let i = firstOrdinalIdx; i < calendar.length; i += 1) {
      const ordinal = i - firstOrdinalIdx;
      if (ordinal % rebalanceDays !== 0) {
        continue; // 非调仓日零信号
      }
      const date = calendar[i];
      const baseIdx = i;
      if (baseIdx < lookbackN) {
        continue; // 基准回看日 d0 不在窗口内（预热不足）→ 当日无动量分可算，无信号
      }
      const d0 = calendar[baseIdx - lookbackN];
      // 动量分：基准日历当日收盘 vs 前 lookbackN 个交易日收盘（各标的自有日期映射按键查找）
      const scored: Array<{ symbol: string; score: number }> = [];
      for (const symbol of symbols) {
        const closes = closeByKey.get(symbol);
        if (!closes) {
          continue;
        }
        const now = closes.get(date);
        const base = closes.get(d0);
        if (now == null || base == null || base <= 0) {
          continue; // 缺 bar 或除零 → 排除（-Infinity 语义）
        }
        scored.push({ symbol, score: now / base - 1 });
      }
      // 排名：分数降序，并列按 symbol 字典序升序（确定性）
      scored.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.symbol.localeCompare(b.symbol)));
      const top = scored.slice(0, holdTop);
      // 目标空或最高分<=0 → 空仓（清仓所有已持有）
      const target = top.length > 0 && top[0].score > 0 ? top.map((item) => item.symbol) : [];
      // 先卖：已持有 ∉ 目标（字典序，确定性）
      const toSell = [...holdings].filter((symbol) => !target.includes(symbol)).sort();
      for (const symbol of toSell) {
        signals.push({ date, symbol, action: 'sell' });
        holdings.delete(symbol);
      }
      // 后买：目标 ∉ 已持有（排名序——scored 已按分数降序，target 保持该序）
      for (const symbol of target) {
        if (!holdings.has(symbol)) {
          signals.push({ date, symbol, action: 'buy' });
          holdings.add(symbol);
        }
      }
    }
    return signals;
  }
};

// ---------- 注册表 ----------

/** 模板注册表（键集即 API template 字段白名单）。 */
export const STRATEGY_DEFINITIONS: Readonly<Record<StrategyTemplate, StrategyDefinition>> = {
  'ma-cross': maCrossStrategy,
  macd: macdStrategy,
  donchian: donchianStrategy,
  'etf-momentum': etfMomentumStrategy
};

/** 合法模板标识数组（DTO @IsIn 与服务层共用）。 */
export const STRATEGY_TEMPLATES: StrategyTemplate[] = ['ma-cross', 'macd', 'donchian', 'etf-momentum'];

/** 模板定义查询：未知模板返回 null（服务层转 422）。 */
export const getStrategyDefinition = (template: string): StrategyDefinition | null =>
  (STRATEGY_DEFINITIONS as Record<string, StrategyDefinition | undefined>)[template] ?? null;

/**
 * 配置生效仓位参数：显式配置 position_model 优先；否则模板默认
 * （etf-momentum 的 fixed-ratio ratio 按 holdTop 等权分槽=1/holdTop；donchian 的 atrPeriod 取模板参数）。
 */
export const defaultPositionModelFor = (
  def: StrategyDefinition,
  params: Record<string, unknown>
): StrategyDefinition['defaultPositionModel'] => {
  if (def.template === 'etf-momentum') {
    const holdTop = Number(params.holdTop);
    return { type: 'fixed-ratio', ratio: Number.isFinite(holdTop) && holdTop > 0 ? 1 / holdTop : 1 };
  }
  if (def.template === 'donchian') {
    const atrPeriod = Number(params.atrPeriod);
    return {
      type: 'atr',
      riskPct: 0.01,
      maxPositionPct: 1,
      atrPeriod: Number.isInteger(atrPeriod) && atrPeriod >= 2 ? atrPeriod : 14
    };
  }
  return { ...def.defaultPositionModel };
};
