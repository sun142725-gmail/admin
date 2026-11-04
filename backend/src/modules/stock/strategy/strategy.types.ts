// 策略插件契约类型（方案 §1.1）。纯类型文件：照 backtest.types.ts:1-6 零运行时依赖范式，
// 不 import 任何运行时依赖（含 @nestjs/*），供模板纯函数、组合撮合重放器、服务层与 e2e 共用。
//
// 与回测内核的关系（§0.1 架构决策声明）：模拟盘=重放式投影——每次调度把启用策略从
// 「固定锚预热段+正式段」窗口重喂「信号函数→撮合」，结果投影落库。信号函数只产出方向信号，
// 成交由既有撮合路径完成（单标的走 runBacktest 内核 / 组合走 runPortfolioBacktest，两者共享
// fillPrice/buyFee/sellFee/仓位插件与 T+1 开盘成交口径），不存在第二套撮合逻辑。
import { Bar } from '../backtest/backtest.types';

/** 四个内置策略模板标识。 */
export type StrategyTemplate = 'ma-cross' | 'macd' | 'donchian' | 'etf-momentum';

/**
 * 策略信号：date=T 信号日，成交固定 T+1 开盘（内核同语义，backtest.types.ts:21-25）。
 * 组合层相对内核 Signal 增加 symbol 维度。
 */
export interface StrategySignal {
  date: string;
  symbol: string;
  action: 'buy' | 'sell';
}

/** 策略信号函数输入。 */
export interface StrategyInput {
  /** 各标的日 K（日期升序，与 BacktestService.loadBars 同构；键=归一化代码 sh600519）。 */
  barsBySymbol: Record<string, Bar[]>;
  /**
   * 已过模板参数校验的参数（JSON 列解析 + defaultParams 合并后的最终值）。
   * 键集=模板参数白名单——禁止借 params 注入 sim_start_date 等非模板键（校验在 validateParams）。
   */
  params: Record<string, unknown>;
  /**
   * 重放正式段起点（YYYY-MM-DD，取自 configs.sim_start_date 列，非模板参数）。
   * etf-momentum 必读——调仓日锚日=max(simStartDate, 基准日历窗口首日)（§1.2④）；
   * 单标的模板（ma-cross/macd/donchian）无调仓相位概念，忽略该字段。
   */
  simStartDate: string;
}

/** 单模板默认仓位参数（镜像 BacktestPositionModelDto 的字段集；具体解析走 resolvePositionModel）。 */
export interface StrategyDefaultPositionModel {
  type: 'all-in' | 'fixed-ratio' | 'atr';
  ratio?: number;
  riskPct?: number;
  maxPositionPct?: number;
  atrPeriod?: number;
}

/** 策略模板定义（插件契约）。 */
export interface StrategyDefinition {
  template: StrategyTemplate;
  /** 展示名。 */
  label: string;
  /** 单标的模板（barsBySymbol 恒单键，服务层喂 runBacktest 前剥离 symbol 映射回内核 Signal）。 */
  singleSymbol: boolean;
  /** 结构最小 bar 数（低于此根数 generateSignals 恒返回空；数值口径见各模板实现注释）。 */
  minBars: number;
  /** 默认参数（服务层与 configs.params JSON 合并，键集=白名单）。 */
  defaultParams: Record<string, number>;
  defaultPositionModel: StrategyDefaultPositionModel;
  /** 参数校验：返回错误消息数组，空=合法。同时负责键集白名单（未知键报错）。 */
  validateParams(params: Record<string, unknown>): string[];
  /**
   * 信号生成：纯函数，判定只读因果窗口（第 i 根判定只依赖 bars[0..i]），防未来函数；
   * 无 I/O、不 import @nestjs/*。bars 不足 minBars 返回 []。
   */
  generateSignals(input: StrategyInput): StrategySignal[];
}
