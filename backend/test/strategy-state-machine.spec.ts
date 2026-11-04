// 状态机单测（方案 §3 r4 / §9）：两迁移表逐行迭代断言（表即文档）+ 终态无出边 throw + 非法四行
// throw + 折叠器必现路径用例（含 r4 全窗口折叠用例④——锁死折叠范围=全窗口）。
import {
  SIGNAL_TRANSITIONS,
  POSITION_TRANSITIONS,
  transitionSignal,
  transitionPosition,
  foldProjection,
  SignalStatus,
  PositionStatus,
  PositionEventType
} from '../src/modules/stock/strategy/strategy-state-machine.util';
import { PortfolioTradeRecord } from '../src/modules/stock/strategy/strategy-portfolio-match.util';
import { StrategySignal } from '../src/modules/stock/strategy/strategy.types';

const POSITION_EVENT_TYPES: PositionEventType[] = [
  'buy_emitted',
  'sell_emitted',
  'buy_filled',
  'buy_skipped',
  'sell_filled',
  'sell_skipped',
  'mark',
  'reset'
];
const POSITION_STATES: PositionStatus[] = ['flat', 'pending_open', 'holding', 'pending_close'];
/** 非法四行（缺席即 throw 的结构性漂移格）。 */
const ILLEGAL_CELLS: Array<[PositionStatus, PositionEventType]> = [
  ['flat', 'sell_filled'],
  ['pending_open', 'sell_filled'],
  ['holding', 'buy_filled'],
  ['pending_close', 'buy_filled']
];

describe('SIGNAL_TRANSITIONS (table as documentation)', () => {
  it('emitted has exactly the two match edges; terminal states have none', () => {
    expect(SIGNAL_TRANSITIONS.emitted).toEqual({ match_filled: 'filled', match_skipped: 'skipped' });
    for (const terminal of ['filled', 'skipped'] as SignalStatus[]) {
      expect(Object.keys(SIGNAL_TRANSITIONS[terminal])).toHaveLength(0);
    }
  });

  it('transitionSignal walks the table and throws on terminal/unknown events', () => {
    expect(transitionSignal('emitted', { type: 'match_filled', filledPrice: 11.011, shares: 9000, fee: 29.73 })).toBe('filled');
    expect(transitionSignal('emitted', { type: 'match_skipped', skipReason: 'no_bar' })).toBe('skipped');
    expect(() => transitionSignal('filled', { type: 'match_filled', filledPrice: 1, shares: 1, fee: 0 })).toThrow();
    expect(() => transitionSignal('skipped', { type: 'match_skipped', skipReason: 'no_position' })).toThrow();
    expect(() => transitionSignal('emitted', { type: 'bogus' as never } as never)).toThrow();
  });
});

describe('POSITION_TRANSITIONS (4 states × 8 events, matrix complete)', () => {
  it('every cell is either an explicit edge or one of the four illegal cells', () => {
    for (const status of POSITION_STATES) {
      for (const eventType of POSITION_EVENT_TYPES) {
        const edge = POSITION_TRANSITIONS[status][eventType];
        const illegal = ILLEGAL_CELLS.some(([s, e]) => s === status && e === eventType);
        if (illegal) {
          expect(edge).toBeUndefined();
        } else {
          expect(`${status}×${eventType}:${edge ?? 'MISSING'}`).toBe(
            `${status}×${eventType}:${POSITION_STATES.includes(edge as PositionStatus) ? edge : 'MISSING'}`
          );
        }
      }
    }
  });

  it('row-by-row: documented semantics hold', () => {
    // 建仓等待与解除
    expect(POSITION_TRANSITIONS.flat.buy_emitted).toBe('pending_open');
    expect(POSITION_TRANSITIONS.pending_open.buy_filled).toBe('holding');
    expect(POSITION_TRANSITIONS.pending_open.buy_skipped).toBe('flat'); // ★幽灵 pending_open 消除
    // 持仓与卖出等待
    expect(POSITION_TRANSITIONS.holding.sell_emitted).toBe('pending_close');
    expect(POSITION_TRANSITIONS.pending_close.sell_filled).toBe('flat');
    expect(POSITION_TRANSITIONS.pending_close.sell_skipped).toBe('holding'); // ★回实际持仓
    // 防御行（原态）
    expect(POSITION_TRANSITIONS.holding.buy_emitted).toBe('holding');
    expect(POSITION_TRANSITIONS.pending_close.buy_emitted).toBe('pending_close');
    expect(POSITION_TRANSITIONS.pending_open.buy_emitted).toBe('pending_open');
    expect(POSITION_TRANSITIONS.pending_close.sell_emitted).toBe('pending_close');
    expect(POSITION_TRANSITIONS.flat.sell_emitted).toBe('flat'); // 虚拟持仓分歧可达
    expect(POSITION_TRANSITIONS.pending_open.sell_emitted).toBe('pending_open'); // 买入未成交先发卖出
    // skip 通配（除 ★ 两格外恒原态）
    expect(POSITION_TRANSITIONS.flat.buy_skipped).toBe('flat');
    expect(POSITION_TRANSITIONS.holding.buy_skipped).toBe('holding');
    expect(POSITION_TRANSITIONS.pending_close.buy_skipped).toBe('pending_close');
    expect(POSITION_TRANSITIONS.flat.sell_skipped).toBe('flat');
    expect(POSITION_TRANSITIONS.pending_open.sell_skipped).toBe('pending_open');
    expect(POSITION_TRANSITIONS.holding.sell_skipped).toBe('holding');
    // mark/reset 状态中性
    for (const status of POSITION_STATES) {
      expect(POSITION_TRANSITIONS[status].mark).toBe(status);
      expect(POSITION_TRANSITIONS[status].reset).toBe('flat');
    }
  });

  it('illegal four cells throw on transition', () => {
    for (const [status, eventType] of ILLEGAL_CELLS) {
      expect(() => transitionPosition(status, { type: eventType })).toThrow(/非法迁移/);
    }
  });
});

describe('foldProjection (projection folding, whole-window economic events)', () => {
  const signal = (date: string, symbol: string, action: 'buy' | 'sell'): StrategySignal => ({ date, symbol, action });
  const filledTrade = (
    signalDate: string,
    symbol: string,
    signalAction: 'buy' | 'sell',
    extra: Partial<PortfolioTradeRecord> = {}
  ): PortfolioTradeRecord => ({
    signalDate,
    signalAction,
    status: 'filled',
    skipReason: null,
    tradeDate: '2026-09-22',
    price: 10,
    filledPrice: 10,
    shares: 1000,
    gross: 10000,
    fee: 0,
    cashAfter: 0,
    positionAfter: 1000,
    lastBuyTradeDate: signalAction === 'buy' ? '2026-09-22' : null,
    symbol,
    ...extra
  });
  const skippedTrade = (
    signalDate: string,
    symbol: string,
    signalAction: 'buy' | 'sell',
    skipReason: PortfolioTradeRecord['skipReason']
  ): PortfolioTradeRecord => ({
    signalDate,
    signalAction,
    status: 'skipped',
    skipReason,
    tradeDate: skipReason === 'no_bar' || skipReason === 'no_next_bar' ? null : '2026-09-22',
    price: skipReason === 'no_bar' || skipReason === 'no_next_bar' ? null : 10,
    filledPrice: null,
    shares: 0,
    gross: null,
    fee: null,
    cashAfter: 0,
    positionAfter: 0,
    lastBuyTradeDate: null,
    symbol
  });

  it('① buy limit_up-skipped → sell no_position-skipped: stays flat, no throw (ghost-free)', () => {
    const output = foldProjection({
      signals: [signal('2026-09-21', 'sh600519', 'buy'), signal('2026-09-28', 'sh600519', 'sell')],
      trades: [skippedTrade('2026-09-21', 'sh600519', 'buy', 'limit_up'), skippedTrade('2026-09-28', 'sh600519', 'sell', 'no_position')],
      initialCash: 100000,
      simStartDate: null,
      marks: { sh600519: { date: '2026-09-29', close: 4 } },
      markDate: '2026-09-29'
    });
    expect(output.positionRows).toEqual([
      expect.objectContaining({ symbol: 'sh600519', status: 'flat', shares: 0 })
    ]);
    expect(output.signalRows.map((row) => [row.action, row.status, row.skipReason])).toEqual([
      ['buy', 'skipped', 'limit_up'],
      ['sell', 'skipped', 'no_position']
    ]);
    expect(output.account.cash).toBe(100000); // 全程无成交
    expect(output.account.equity).toBe(100000);
  });

  it('② sell limit_down-skipped stays pending_close → later buy_emitted keeps holding (mirror path, no throw)', () => {
    const output = foldProjection({
      signals: [
        signal('2026-09-21', 'sh600519', 'buy'),
        signal('2026-09-28', 'sh600519', 'sell'),
        signal('2026-10-09', 'sh600519', 'buy')
      ],
      trades: [
        filledTrade('2026-09-21', 'sh600519', 'buy'),
        skippedTrade('2026-09-28', 'sh600519', 'sell', 'limit_down'),
        skippedTrade('2026-10-09', 'sh600519', 'buy', 'already_holding')
      ],
      initialCash: 100000,
      simStartDate: null,
      marks: { sh600519: { date: '2026-10-12', close: 12 } },
      markDate: '2026-10-12'
    });
    expect(output.positionRows).toEqual([
      expect.objectContaining({ symbol: 'sh600519', status: 'holding', shares: 1000 })
    ]);
    expect(output.signalRows.map((row) => [row.action, row.status, row.skipReason])).toEqual([
      ['buy', 'filled', null],
      ['sell', 'skipped', 'limit_down'],
      ['buy', 'skipped', 'already_holding']
    ]);
  });

  it('③ buy limit_up-skipped resolves pending_open back to flat; sell no_bar-skipped returns to holding', () => {
    const ghostFree = foldProjection({
      signals: [signal('2026-09-21', 'sh600519', 'buy')],
      trades: [skippedTrade('2026-09-21', 'sh600519', 'buy', 'limit_up')],
      initialCash: 100000,
      simStartDate: null,
      marks: { sh600519: { date: '2026-09-22', close: 11 } },
      markDate: '2026-09-22'
    });
    expect(ghostFree.positionRows[0]).toEqual(expect.objectContaining({ status: 'flat', shares: 0 }));
    expect(ghostFree.signalRows[0]).toEqual(expect.objectContaining({ status: 'skipped', skipReason: 'limit_up' }));

    const backToHolding = foldProjection({
      signals: [signal('2026-09-21', 'sz510500', 'buy'), signal('2026-09-24', 'sz510500', 'sell')],
      trades: [
        filledTrade('2026-09-21', 'sz510500', 'buy'),
        skippedTrade('2026-09-24', 'sz510500', 'sell', 'no_bar')
      ],
      initialCash: 100000,
      simStartDate: null,
      marks: { sz510500: { date: '2026-09-25', close: 12 } },
      markDate: '2026-09-25'
    });
    expect(backToHolding.positionRows[0]).toEqual(expect.objectContaining({ status: 'holding', shares: 1000 }));
    expect(backToHolding.signalRows[1]).toEqual(expect.objectContaining({ status: 'skipped', skipReason: 'no_bar' }));
  });

  it('④ whole-window folding: warmup buy fill + formal-segment sell fill folds without throw (r4 lock)', () => {
    // 折叠范围=全窗口：预热段金叉建仓（fill）+ 正式段 sell filled——若字面把折叠切成
    // sim_start_date 起（flat+全额资金起步），sell_filled 在 flat 上命中非法格 throw → 本用例必失败。
    const output = foldProjection({
      signals: [signal('2026-09-21', 'sh600519', 'buy'), signal('2026-09-28', 'sh600519', 'sell')],
      trades: [
        filledTrade('2026-09-21', 'sh600519', 'buy', { gross: 11000, shares: 1000, filledPrice: 11, tradeDate: '2026-09-22' }),
        filledTrade('2026-09-28', 'sh600519', 'sell', { gross: 12000, shares: 1000, filledPrice: 12, tradeDate: '2026-09-29', cashAfter: 11000 })
      ],
      initialCash: 100000,
      simStartDate: '2026-09-25', // 买入信号在预热段（不落库），卖出信号在正式段（落库）
      marks: { sh600519: { date: '2026-09-29', close: 12 } },
      markDate: '2026-09-29'
    });
    // 全程无 throw；预热段 buy 信号行不落库、正式段 sell 落库为 filled
    expect(output.signalRows).toEqual([
      expect.objectContaining({ action: 'sell', status: 'filled', filledPrice: 12, shares: 1000 })
    ]);
    // 持仓终态 flat；last_buy_date 保留预热段买入成交日（影子账户口径）
    expect(output.positionRows).toEqual([
      expect.objectContaining({ symbol: 'sh600519', status: 'flat', shares: 0, lastBuyDate: '2026-09-22', avgCost: null })
    ]);
    // 现金=手推值：100000 − 11000 + 12000 = 101000（预热段经济后果计入账户）
    expect(output.account.cash).toBe(101000);
    expect(output.account.equity).toBe(101000);
    expect(output.account.replayedThrough).toBe('2026-09-29');
  });

  it('mark writes valuation columns; reset via rebuild starts from flat', () => {
    const output = foldProjection({
      signals: [signal('2026-09-21', 'sh600519', 'buy')],
      trades: [filledTrade('2026-09-21', 'sh600519', 'buy', { gross: 11000, shares: 1000, filledPrice: 11, fee: 0, tradeDate: '2026-09-22' })],
      initialCash: 100000,
      simStartDate: null,
      marks: { sh600519: { date: '2026-09-29', close: 12 } },
      markDate: '2026-09-29'
    });
    expect(output.positionRows[0]).toEqual({
      symbol: 'sh600519',
      status: 'holding',
      shares: 1000,
      avgCost: 11,
      lastBuyDate: '2026-09-22',
      lastMarkDate: '2026-09-29',
      lastPrice: 12,
      marketValue: 12000,
      unrealizedPnl: 1000
    });
    expect(output.account).toEqual({ cash: 89000, marketValue: 12000, equity: 101000, replayedThrough: '2026-09-29' });
  });

  it('warmup signals are folded economically but excluded from signal rows (sim_start_date filter)', () => {
    const output = foldProjection({
      signals: [
        signal('2026-09-01', 'sh600519', 'buy'),
        signal('2026-09-05', 'sh600519', 'sell'),
        signal('2026-09-10', 'sh600519', 'buy')
      ],
      trades: [
        filledTrade('2026-09-01', 'sh600519', 'buy', { tradeDate: '2026-09-02' }),
        filledTrade('2026-09-05', 'sh600519', 'sell', { tradeDate: '2026-09-06' }),
        skippedTrade('2026-09-10', 'sh600519', 'buy', 'suspended')
      ],
      initialCash: 100000,
      simStartDate: '2026-09-08', // 前两个信号在预热段
      marks: { sh600519: { date: '2026-09-11', close: 10 } },
      markDate: '2026-09-11'
    });
    expect(output.signalRows.map((row) => row.tradeDate)).toEqual(['2026-09-10']);
    expect(output.signalRows[0]).toEqual(expect.objectContaining({ status: 'skipped', skipReason: 'suspended' }));
    expect(output.positionRows).toEqual([
      expect.objectContaining({ symbol: 'sh600519', status: 'flat', shares: 0, lastBuyDate: '2026-09-02' })
    ]);
  });
});
