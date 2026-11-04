// 策略投影状态机（方案 §3）：信号状态机 + 持仓状态机（迁移表驱动，表即文档）+ 投影折叠器。
// 全部无 I/O、不依赖 Nest 容器、不 import @nestjs/*。
//
// 折叠范围（r4 钉死）：折叠输入=全窗口（预热段+正式段）的 signals+trades 经济事件——
// 预热段的 emitted/filled/skipped 事件全部参与持仓/账户折叠（其经济后果计入影子账户：
// 持仓 last_buy_date/avg_cost 可早于 sim_start_date、账户正式段起点净值≠initial_cash）；
// sim_start_date 过滤仅作用于信号行落库（预热段信号不写 stock_strategy_signals）。
// 若按字面把折叠也切成 sim_start_date 起（从 flat+全额初始资金起步），而撮合器吃全窗口
// （预热段金叉已建仓），正式段首信号常为 sell 且 FILLED → 折叠命中 flat×sell_filled → throw →
// 投影不落库，重放确定性使该 throw 每日复现、策略瘫痪（§3 修订说明⑥）。
import { StrategySignal } from './strategy.types';
import { PortfolioSkipReason, PortfolioTradeRecord } from './strategy-portfolio-match.util';

// ---------- 信号状态机 ----------

export type SignalStatus = 'emitted' | 'filled' | 'skipped';

export type SignalEvent =
  | { type: 'match_filled'; filledPrice: number; shares: number; fee: number }
  | { type: 'match_skipped'; skipReason: PortfolioSkipReason };

export type SignalEventType = SignalEvent['type'];

/**
 * 信号状态机迁移表：emitted 有 match_filled/match_skipped 两条出边；
 * filled/skipped 为终态无出边（对任意事件 throw——终态不可再迁移）。
 */
export const SIGNAL_TRANSITIONS: Record<SignalStatus, Partial<Record<SignalEventType, SignalStatus>>> = {
  emitted: {
    match_filled: 'filled',
    match_skipped: 'skipped'
  },
  filled: {}, // 终态无出边
  skipped: {} // 终态无出边
};

/** 信号状态迁移：非法迁移 throw（终态无出边/未知事件）。 */
export function transitionSignal(status: SignalStatus, event: SignalEvent): SignalStatus {
  const next = SIGNAL_TRANSITIONS[status][event.type];
  if (next == null) {
    throw new Error(`信号状态机非法迁移: ${status} × ${event.type}`);
  }
  return next;
}

// ---------- 持仓状态机 ----------

export type PositionStatus = 'flat' | 'pending_open' | 'holding' | 'pending_close';

export type PositionEventType =
  | 'buy_emitted'
  | 'sell_emitted'
  | 'buy_filled'
  | 'buy_skipped'
  | 'sell_filled'
  | 'sell_skipped'
  | 'mark'
  | 'reset';

export type PositionEvent = { type: PositionEventType } & Record<string, unknown>;

/**
 * 持仓状态机迁移表（4 态 × 8 事件矩阵逐格显式完备；「非法四行」缺席=transitionPosition throw）：
 * - flat×buy_emitted→pending_open：等待次日开盘成交。
 * - flat×sell_emitted→flat（原态）：虚拟持仓分歧可达（信号函数状态与撮合器实际持仓分歧）。
 * - holding×sell_emitted→pending_close：等待卖出成交。
 * - holding×buy_emitted→holding（原态，防御行）：donchian 连续突破日 buy 信号，
 *   撮合器会 already_holding skip，事件对为 buy_emitted+buy_skipped。
 * - pending_close×buy_emitted→pending_close（原态，防御行而非可达态——signalDate 归并键下
 *   （见 foldProjection 归并说明），每个信号的 match 事件与其 emitted 事件同键先后折叠，
 *   pending 态不跨自身信号存活；而卖出信号无 match 记录仅当其为最新 bar 日信号，此后不可能有
 *   更晚日期的 buy 信号。保留以防归并口径变化。
 * - pending_open×buy_emitted→pending_open（原态，幂等防御行）。
 * - pending_open×sell_emitted→pending_open（原态）：买入未成交先发卖出，可达。
 * - pending_close×sell_emitted→pending_close（原态，幂等防御行）。
 * - flat/pending_open×buy_filled→holding：写入 shares/avg_cost/last_buy_date。
 * - holding/pending_close×sell_filled→flat：shares=0。
 * - skip 类事件通配规则：skip 恒不变原态，唯二例外（★语义=「解除等待回实际持仓态」）：
 *   ★pending_open×buy_skipped→flat（买入被 limit_up/suspended/no_next_bar/insufficient_funds 等
 *     skip → 解除等待，消除 shares=0 幽灵行）；
 *   ★pending_close×sell_skipped→holding（卖出被 limit_down/suspended/no_bar/t_plus_1 等
 *     skip → 解除等待，回实际持仓）。
 * - mark/reset 状态中性：mark 恒原态（写盯市四列）；reset 恒 flat（投影重建折叠起点）。
 * - 非法四行（结构性漂移，缺席=throw）：flat×sell_filled、pending_open×sell_filled、
 *   holding×buy_filled、pending_close×buy_filled（与 already_holding skip 语义互斥，结构不可达）。
 */
export const POSITION_TRANSITIONS: Record<PositionStatus, Partial<Record<PositionEventType, PositionStatus>>> = {
  flat: {
    buy_emitted: 'pending_open',
    sell_emitted: 'flat', // 原态：虚拟持仓分歧可达
    buy_filled: 'holding',
    buy_skipped: 'flat', // skip 通配：恒原态
    // sell_filled: 缺席 → 非法四行（flat 无持仓不可能卖出成交）→ throw
    sell_skipped: 'flat', // no_position skip：恒原态
    mark: 'flat',
    reset: 'flat'
  },
  pending_open: {
    buy_emitted: 'pending_open', // 重复 emitted：幂等防御行
    sell_emitted: 'pending_open', // 买入未成交先发卖出：可达，原态
    buy_filled: 'holding',
    buy_skipped: 'flat', // ★解除等待：幽灵 pending_open 消除
    // sell_filled: 缺席 → 非法四行（未建仓不可能卖出成交）→ throw
    sell_skipped: 'pending_open', // skip 通配：恒原态
    mark: 'pending_open',
    reset: 'flat'
  },
  holding: {
    buy_emitted: 'holding', // 防御行（连续突破日 buy，配对 buy_skipped）
    sell_emitted: 'pending_close',
    // buy_filled: 缺席 → 非法四行（单持仓语义下已持有不可能再买入成交）→ throw
    buy_skipped: 'holding', // already_holding skip：恒原态
    sell_filled: 'flat',
    sell_skipped: 'holding', // skip 通配：恒原态
    mark: 'holding',
    reset: 'flat'
  },
  pending_close: {
    buy_emitted: 'pending_close', // 防御行而非可达态（见函数头 r4 注释修正）
    sell_emitted: 'pending_close', // 重复 emitted：幂等防御行
    // buy_filled: 缺席 → 非法四行（卖出等待中不可能买入成交）→ throw
    buy_skipped: 'pending_close', // skip 通配：恒原态
    sell_filled: 'flat',
    sell_skipped: 'holding', // ★解除等待：回实际持仓
    mark: 'pending_close',
    reset: 'flat'
  }
};

/** 持仓状态迁移：非法迁移 throw（含非法四行/终态性漂移）。 */
export function transitionPosition(status: PositionStatus, event: PositionEvent): PositionStatus {
  const next = POSITION_TRANSITIONS[status][event.type];
  if (next == null) {
    throw new Error(`持仓状态机非法迁移: ${status} × ${event.type}（结构性漂移）`);
  }
  return next;
}

// ---------- 投影折叠器 ----------

/** 折叠输入。signals 与 trades 必须来自同一次撮合重放（每个信号恰配一个 match 事件）。 */
export interface ProjectionFoldInput {
  /** 全窗口信号（日期升序、同日按输入序；乱序输入内部稳定排序归一）。 */
  signals: StrategySignal[];
  /** 组合撮合产出（含 skipped 记录；tradeDate/price 双 null 的 no_bar/no_next_bar 记录合法）。 */
  trades: PortfolioTradeRecord[];
  initialCash: number;
  /**
   * 重放正式段起点（YYYY-MM-DD）；null = 无正式段过滤（信号行全落库）。
   * 仅过滤信号行落库——持仓/账户折叠始终消费全窗口事件（折叠范围 r4 钉死）。
   */
  simStartDate: string | null;
  /** 每 symbol 盯市价：各自最近一根 bar（含 volume=0 停牌占位行）；无 bar 的 symbol 值为 null。 */
  marks: Record<string, { date: string; close: number } | null>;
  /** 组合盯市日 = 库内最新 bar 日（基准日历口径，写 accounts.replayed_through）。 */
  markDate: string | null;
}

/** 落库信号行（strategyId 由服务层补）。 */
export interface ProjectedSignalRow {
  tradeDate: string;
  symbol: string;
  action: 'buy' | 'sell';
  status: SignalStatus;
  skipReason: PortfolioSkipReason | null;
  filledPrice: number | null;
  shares: number;
  fee: number | null;
}

/** 落库持仓行（strategyId 由服务层补）。 */
export interface ProjectedPositionRow {
  symbol: string;
  status: PositionStatus;
  shares: number;
  avgCost: number | null;
  lastBuyDate: string | null;
  lastMarkDate: string | null;
  lastPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
}

/** 落库账户行（strategyId 由服务层补）。 */
export interface ProjectedAccountRow {
  cash: number;
  marketValue: number;
  equity: number;
  replayedThrough: string | null;
}

export interface ProjectionFoldOutput {
  signalRows: ProjectedSignalRow[];
  positionRows: ProjectedPositionRow[];
  account: ProjectedAccountRow;
}

interface FoldPositionState {
  status: PositionStatus;
  shares: number;
  avgCost: number | null;
  lastBuyDate: string | null;
}

/**
 * 投影折叠器：全窗口归并流逐事件 transitionSignal（仅 trade_date>=sim_start_date 的信号行落库）
 * + transitionPosition 折叠（写持仓行）→ 末尾对每持仓发 mark（盯市）→ 账户汇总。
 *
 * 归并键（方案 §3）：emitted 事件键=(信号日 T, symbol, action)；match 事件键=(TradeRecord.signalDate,
 * symbol, action, 输入序)——用 signalDate（信号日，恒非空，backtest.types.ts:40-44），不用 tradeDate
 * （no_bar/no_next_bar 的 tradeDate 恒 null，null 排序歧义已根除）；match 事件必后至于其 emitted 事件，
 * skip 类记录位置无关性由此保证。实现：按同键出现序配对——第 i 个 emitted 事件配对第 i 个同键 trade。
 *
 * avg_cost 口径：含费含滑点买入成本 = Σ(gross+fee)/Σshares（清仓归 null；再建仓重新累计）。
 * last_buy_date 口径：最近一次买入成交日（历史事实，sell_filled 不清除——预热段建仓用例依赖
 * 「持仓行 last_buy_date 可早于 sim_start_date」在清仓后仍可查证）。
 */
export function foldProjection(input: ProjectionFoldInput): ProjectionFoldOutput {
  const { trades, initialCash, simStartDate, marks, markDate } = input;

  const positions = new Map<string, FoldPositionState>();
  const touch = (symbol: string): FoldPositionState => {
    let state = positions.get(symbol);
    if (!state) {
      state = { status: 'flat', shares: 0, avgCost: null, lastBuyDate: null };
      positions.set(symbol, state);
    }
    return state;
  };

  let cash = initialCash;
  const signalRows: ProjectedSignalRow[] = [];

  // match 事件队列：键=(signalDate|symbol|action)，值=该键 trades（输入序）
  const matchQueue = new Map<string, PortfolioTradeRecord[]>();
  for (const trade of trades) {
    const key = `${trade.signalDate}|${trade.symbol}|${trade.signalAction}`;
    const list = matchQueue.get(key) ?? [];
    list.push(trade);
    matchQueue.set(key, list);
  }

  /** 应用一个 match 事件（信号状态迁移 + 持仓折叠 + 现金结算）。 */
  const applyMatch = (signal: StrategySignal, row: ProjectedSignalRow | null, trade: PortfolioTradeRecord): void => {
    const state = touch(signal.symbol);
    if (trade.status === 'filled') {
      if (row) {
        row.status = transitionSignal('emitted', {
          type: 'match_filled',
          filledPrice: trade.filledPrice ?? 0,
          shares: trade.shares,
          fee: trade.fee ?? 0
        });
        row.filledPrice = trade.filledPrice ?? null;
        row.shares = trade.shares;
        row.fee = trade.fee ?? null;
      } else {
        transitionSignal('emitted', {
          type: 'match_filled',
          filledPrice: trade.filledPrice ?? 0,
          shares: trade.shares,
          fee: trade.fee ?? 0
        });
      }
      if (trade.signalAction === 'buy') {
        state.status = transitionPosition(state.status, { type: 'buy_filled' });
        const gross = trade.gross ?? 0;
        const fee = trade.fee ?? 0;
        const newShares = state.shares + trade.shares;
        const openCost = (state.avgCost ?? 0) * state.shares;
        state.avgCost = newShares > 0 ? (openCost + gross + fee) / newShares : null;
        state.shares = newShares;
        state.lastBuyDate = trade.tradeDate;
        cash -= gross + fee;
      } else {
        state.status = transitionPosition(state.status, { type: 'sell_filled' });
        const gross = trade.gross ?? 0;
        const fee = trade.fee ?? 0;
        state.shares = 0;
        state.avgCost = null; // 清仓语义：成本基随持仓归零（last_buy_date 保留为历史事实）
        cash += gross - fee;
      }
    } else {
      const skipReason = trade.skipReason ?? 'no_bar';
      if (row) {
        row.status = transitionSignal('emitted', { type: 'match_skipped', skipReason });
        row.skipReason = skipReason;
      } else {
        transitionSignal('emitted', { type: 'match_skipped', skipReason });
      }
      state.status = transitionPosition(state.status, {
        type: trade.signalAction === 'buy' ? 'buy_skipped' : 'sell_skipped'
      });
    }
  };

  // 信号驱动的主折叠流（输入乱序时稳定排序归一；同日保输入序=撮合器处理序）。
  const orderedSignals = [...input.signals].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const signal of orderedSignals) {
    const state = touch(signal.symbol);
    // emitted 事件（经济事件——无论是否落库都参与持仓折叠；信号行按 sim_start_date 过滤）
    state.status = transitionPosition(state.status, {
      type: signal.action === 'buy' ? 'buy_emitted' : 'sell_emitted'
    });
    const includeRow = simStartDate == null || signal.date >= simStartDate;
    const row: ProjectedSignalRow | null = includeRow
      ? {
          tradeDate: signal.date,
          symbol: signal.symbol,
          action: signal.action,
          status: 'emitted',
          skipReason: null,
          filledPrice: null,
          shares: 0,
          fee: null
        }
      : null;
    if (row) {
      signalRows.push(row);
    }
    // 同键 match 事件（第 i 个 emitted 配对第 i 个同键 trade）
    const key = `${signal.date}|${signal.symbol}|${signal.action}`;
    const queue = matchQueue.get(key);
    const trade = queue?.shift();
    if (trade) {
      applyMatch(signal, row, trade);
    }
    // 无配对 trade：信号行保留 emitted 态（防御——正常撮合器输出下不可达）。
  }

  // 孤儿 match 事件防御：同键 trades 多于 signals 时按输入序补折叠（结构性漂移会被状态机 throw 拦截）。
  for (const [, queue] of matchQueue) {
    for (const trade of queue) {
      applyMatch(
        { date: trade.signalDate, symbol: trade.symbol, action: trade.signalAction },
        null,
        trade
      );
    }
  }

  // 末尾对每持仓发 mark（盯市）：mark 恒原态，写 last_price/market_value/unrealized_pnl/last_mark_date。
  const positionRows: ProjectedPositionRow[] = [];
  let marketValueSum = 0;
  const symbols = [...positions.keys()].sort();
  for (const symbol of symbols) {
    const state = positions.get(symbol)!;
    state.status = transitionPosition(state.status, { type: 'mark' });
    const mark = marks[symbol] ?? null;
    const lastPrice = mark ? mark.close : null;
    const lastMarkDate = mark ? mark.date : null;
    const marketValue = state.shares > 0 && lastPrice != null ? state.shares * lastPrice : 0;
    const unrealizedPnl =
      state.shares > 0 && lastPrice != null ? marketValue - state.shares * (state.avgCost ?? 0) : null;
    marketValueSum += marketValue;
    positionRows.push({
      symbol,
      status: state.status,
      shares: state.shares,
      avgCost: state.avgCost,
      lastBuyDate: state.lastBuyDate,
      lastMarkDate,
      lastPrice,
      marketValue: state.shares > 0 ? marketValue : 0,
      unrealizedPnl
    });
  }

  return {
    signalRows,
    positionRows,
    account: {
      cash,
      marketValue: marketValueSum,
      equity: cash + marketValueSum,
      replayedThrough: markDate
    }
  };
}
