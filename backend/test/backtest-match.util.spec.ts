// 撮合内核纯函数单测（不依赖网络与 Nest 容器）。一次只激活一条规则（方案 §4.1），
// 基线 config 全零成本使现金/净值全为整数可 toBe 精确；skip 用例按 §2.1/§2.5 v3 契约逐字段写死：
// tradeDate/price 与 T+1 bar 同构（仅 no_next_bar 双 null）、filledPrice/gross/fee 仅 filled 有值、
// shares skipped 恒 0、快照三字段=记录生成时刻账户快照。
// 同日多信号按输入顺序处理（见 backtest-match.util.ts 头注释：方案伪代码 sorted sell->buy 与
// §6.1 必测项「同日先买后卖 t_plus_1 skip」互斥，按测试清单优先实现为输入顺序）。
import { DEFAULT_CONFIG, runBacktest } from '../src/modules/stock/backtest/backtest-match.util';
import { allInModel } from '../src/modules/stock/backtest/backtest-sizing.util';
import { BacktestConfig, Bar, Signal, TradeRecord } from '../src/modules/stock/backtest/backtest.types';

const bar = (date: string, close: number, overrides: Partial<Bar> = {}): Bar => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1000,
  amount: close * 1000,
  ...overrides
});

const zeroCost = { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0 };

const config = (overrides: Partial<BacktestConfig> = {}): BacktestConfig => ({
  initialCash: 100000,
  limitUpPct: 0.1,
  limitDownPct: -0.1,
  limitEps: 0.005,
  cost: { ...zeroCost },
  ...overrides
});

const run = (bars: Bar[], signals: Signal[], cfg: BacktestConfig = config()) =>
  runBacktest({ bars, signals, config: cfg, positionModel: allInModel() });

describe('DEFAULT_CONFIG 默认常量', () => {
  it('①初始资金 10 万 / 阈值 ±10% / eps 5e-3 / 默认成本', () => {
    expect(DEFAULT_CONFIG).toEqual({
      initialCash: 100000,
      limitUpPct: 0.10,
      limitDownPct: -0.10,
      limitEps: 5e-3,
      cost: { commissionRate: 0.0003, minCommission: 5, stampTaxRate: 0.0005, slippageRate: 0.001 }
    });
  });
});

describe('T+1 开盘成交（唯一成交路径）', () => {
  it('②成交日=T 信号次日、price=T+1 原始开盘、记账时点=T 日净值已含次日开盘成交', () => {
    // d2 open=10.5（ratio 0.05 远离容差带）close=11；d1 close=10
    const bars = [
      bar('2026-09-01', 10),
      bar('2026-09-02', 11, { open: 10.5 }),
      bar('2026-09-03', 11)
    ];
    const result = run(bars, [{ date: '2026-09-01', action: 'buy' }]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual({
      signalDate: '2026-09-01',
      signalAction: 'buy',
      status: 'filled',
      skipReason: null,
      tradeDate: '2026-09-02',
      price: 10.5,
      filledPrice: 10.5,
      shares: 9500, // floor(100000/10.5/100)×100
      gross: 99750,
      fee: 0,
      cashAfter: 250,
      positionAfter: 9500,
      lastBuyTradeDate: '2026-09-02'
    });
    // 记账时点锁定：T 日（09-01）净值 = （T+1 开盘成交后现金 250）+ 持仓×T 日收盘 10 = 95250
    //（若误实现为「T+1 迭代才结算」则会是 100000）
    expect(result.equityCurve[0]).toEqual({ date: '2026-09-01', cash: 250, shares: 9500, close: 10, equity: 95250 });
    // 末点净值公式：cash + shares×close
    expect(result.equityCurve[2].equity).toBe(250 + 9500 * 11);
    expect(result.equityCurve).toHaveLength(3);
  });
});

describe('涨停不买（比率口径 + eps 档位缺口容差）', () => {
  // 低价档回归对（方案 §6.1 钉死）：真实涨停价 round(前收×1.1, 0.01) 使比率低于名义阈值
  it('③prevClose=3.01/open=3.31（比率 0.099668）：默认 eps 判涨停不买', () => {
    const result = run([bar('2026-09-01', 3.01), bar('2026-09-02', 3.31)], [
      { date: '2026-09-01', action: 'buy' }
    ]);
    expect(result.trades[0].status).toBe('skipped');
    expect(result.trades[0].skipReason).toBe('limit_up');
    expect(result.trades[0].tradeDate).toBe('2026-09-02');
    expect(result.trades[0].price).toBe(3.31);
    expect(result.trades[0].shares).toBe(0);
    expect(result.trades[0].cashAfter).toBe(100000);
  });

  it('④同对 eps=0 不判涨停而成交（钉住容差修复：无容差必然漏判 → 可成交性虚高）', () => {
    const result = run(
      [bar('2026-09-01', 3.01), bar('2026-09-02', 3.31)],
      [{ date: '2026-09-01', action: 'buy' }],
      config({ limitEps: 0 })
    );
    expect(result.trades[0].status).toBe('filled');
    expect(result.trades[0].shares).toBe(30200); // floor(100000/3.31/100)×100
    expect(result.trades[0].gross).toBeCloseTo(99962, 6);
  });

  it('⑤prevClose=2.52/open=2.77（比率 0.099206）：默认 eps 判涨停、eps=0 成交', () => {
    const skipped = run([bar('2026-09-01', 2.52), bar('2026-09-02', 2.77)], [
      { date: '2026-09-01', action: 'buy' }
    ]);
    expect(skipped.trades[0].skipReason).toBe('limit_up');
    const filled = run(
      [bar('2026-09-01', 2.52), bar('2026-09-02', 2.77)],
      [{ date: '2026-09-01', action: 'buy' }],
      config({ limitEps: 0 })
    );
    expect(filled.trades[0].status).toBe('filled');
    expect(filled.trades[0].shares).toBe(36100);
  });

  it('⑥0.03 级明显未涨停正常成交（默认 eps）', () => {
    const result = run([bar('2026-09-01', 10), bar('2026-09-02', 10.3)], [
      { date: '2026-09-01', action: 'buy' }
    ]);
    expect(result.trades[0].status).toBe('filled');
    expect(result.trades[0].shares).toBe(9700);
  });

  it('⑦阈值参数化 limitUpPct=0.05：0.03 通过、0.06 判涨停（取远离容差带的对照值）', () => {
    const pass = run(
      [bar('2026-09-01', 10), bar('2026-09-02', 10.3)],
      [{ date: '2026-09-01', action: 'buy' }],
      config({ limitUpPct: 0.05 })
    );
    expect(pass.trades[0].status).toBe('filled');
    const blocked = run(
      [bar('2026-09-01', 10), bar('2026-09-02', 10.6)],
      [{ date: '2026-09-01', action: 'buy' }],
      config({ limitUpPct: 0.05 })
    );
    expect(blocked.trades[0].skipReason).toBe('limit_up');
  });
});

describe('跌停不卖', () => {
  // 卖出前置持仓：d0 buy 信号 → d1 开盘 10 全仓成交；d1 sell 信号 → d2 开盘判定
  const setup = (d2Open: number, cfg: BacktestConfig = config()) =>
    run(
      [bar('2026-09-01', 10), bar('2026-09-02', 10), bar('2026-09-03', 9, { open: d2Open })],
      [
        { date: '2026-09-01', action: 'buy' },
        { date: '2026-09-02', action: 'sell' }
      ],
      cfg
    );

  it('⑧open 比率 −0.10 ≤ −0.10+eps 判跌停不卖（快照=持仓不变）', () => {
    const result = setup(9.0);
    expect(result.trades[1]).toEqual({
      signalDate: '2026-09-02',
      signalAction: 'sell',
      status: 'skipped',
      skipReason: 'limit_down',
      tradeDate: '2026-09-03',
      price: 9,
      filledPrice: null,
      gross: null,
      fee: null,
      shares: 0,
      cashAfter: 0,
      positionAfter: 10000,
      lastBuyTradeDate: '2026-09-02'
    });
  });

  it('⑨eps 边界带：−0.096 判跌停、−0.094 放行', () => {
    expect(setup(9.04).trades[1].skipReason).toBe('limit_down');
    expect(setup(9.06).trades[1].status).toBe('filled');
  });

  it('⑩低价镜像对 3.01→2.71 / 2.52→2.27（比率 −0.099668/−0.099206）：默认 eps 判跌停、eps=0 成交', () => {
    const pair = (prevClose: number, open: number) =>
      run(
        [bar('2026-09-01', prevClose), bar('2026-09-02', prevClose), bar('2026-09-03', open, { open })],
        [
          { date: '2026-09-01', action: 'buy' },
          { date: '2026-09-02', action: 'sell' }
        ]
      );
    // 前置买入 float 现金 → 只断言 skip 原因与成交状态
    expect(pair(3.01, 2.71).trades[1].skipReason).toBe('limit_down');
    expect(pair(2.52, 2.27).trades[1].skipReason).toBe('limit_down');
    const filled = run(
      [bar('2026-09-01', 3.01), bar('2026-09-02', 3.01), bar('2026-09-03', 2.71, { open: 2.71 })],
      [
        { date: '2026-09-01', action: 'buy' },
        { date: '2026-09-02', action: 'sell' }
      ],
      config({ limitEps: 0 })
    );
    expect(filled.trades[1].status).toBe('filled');
    expect(filled.trades[1].shares).toBe(33200);
  });
});

describe('停牌口径（§2.1 skipped 字段语义逐字段钉死）', () => {
  it('⑪T+1 无 bar → no_next_bar：tradeDate=null 且 price=null 双 null', () => {
    const result = run([bar('2026-09-01', 10), bar('2026-09-02', 10)], [
      { date: '2026-09-02', action: 'buy' }
    ]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual({
      signalDate: '2026-09-02',
      signalAction: 'buy',
      status: 'skipped',
      skipReason: 'no_next_bar',
      tradeDate: null,
      price: null,
      filledPrice: null,
      gross: null,
      fee: null,
      shares: 0,
      cashAfter: 100000,
      positionAfter: 0,
      lastBuyTradeDate: null
    });
  });

  it('⑫T+1 volume=0 → suspended：tradeDate/price=该停牌 bar，filledPrice/gross/fee=null，快照=当时值', () => {
    const bars = [
      bar('2026-09-01', 10),
      bar('2026-09-02', 10, { volume: 0 }),
      bar('2026-09-03', 10)
    ];
    const result = run(bars, [{ date: '2026-09-01', action: 'buy' }]);
    expect(result.trades[0]).toEqual({
      signalDate: '2026-09-01',
      signalAction: 'buy',
      status: 'skipped',
      skipReason: 'suspended',
      tradeDate: '2026-09-02',
      price: 10,
      filledPrice: null,
      gross: null,
      fee: null,
      shares: 0,
      cashAfter: 100000,
      positionAfter: 0,
      lastBuyTradeDate: null
    });
    // 不递延：后续无信号不再成交；停牌日无 bar 不产生点——此处 bar 仍存在，净值照常逐日
    expect(result.equityCurve).toHaveLength(3);
  });

  it('⑬持仓中遇停牌卖不出：suspended 快照=持仓与 lastBuy 不变', () => {
    const bars = [
      bar('2026-09-01', 10),
      bar('2026-09-02', 10),
      bar('2026-09-03', 10, { volume: 0 })
    ];
    const result = run(bars, [
      { date: '2026-09-01', action: 'buy' },
      { date: '2026-09-02', action: 'sell' }
    ]);
    expect(result.trades[0].status).toBe('filled');
    expect(result.trades[1]).toEqual({
      signalDate: '2026-09-02',
      signalAction: 'sell',
      status: 'skipped',
      skipReason: 'suspended',
      tradeDate: '2026-09-03',
      price: 10,
      filledPrice: null,
      gross: null,
      fee: null,
      shares: 0,
      cashAfter: 0,
      positionAfter: 10000,
      lastBuyTradeDate: '2026-09-02'
    });
  });
});

describe('T+1 可卖（lastBuy < 卖出成交日，严格）', () => {
  it('⑭同日先买后卖：sell 撞上买入成交当日 → t_plus_1，快照含先成交 buy 的现金变动', () => {
    const bars = [
      bar('2026-09-01', 10),
      bar('2026-09-02', 10),
      bar('2026-09-03', 10)
    ];
    // 输入顺序 [buy, sell] 同日：按输入顺序处理 → buy 先成交（cash 100000→0），sell 撞同开盘
    const result = run(bars, [
      { date: '2026-09-01', action: 'buy' },
      { date: '2026-09-01', action: 'sell' }
    ]);
    expect(result.trades[0].status).toBe('filled');
    expect(result.trades[1]).toEqual({
      signalDate: '2026-09-01',
      signalAction: 'sell',
      status: 'skipped',
      skipReason: 't_plus_1',
      tradeDate: '2026-09-02',
      price: 10,
      filledPrice: null,
      gross: null,
      fee: null,
      shares: 0,
      cashAfter: 0, // 先成交信号的现金变动已反映
      positionAfter: 10000,
      lastBuyTradeDate: '2026-09-02'
    });
  });

  it('⑮次日卖出放行：lastBuy(d1) < 卖出成交日(d2)', () => {
    const result = run(
      [bar('2026-09-01', 10), bar('2026-09-02', 10), bar('2026-09-03', 10)],
      [
        { date: '2026-09-01', action: 'buy' },
        { date: '2026-09-02', action: 'sell' }
      ]
    );
    expect(result.trades[0].status).toBe('filled');
    expect(result.trades[1].status).toBe('filled');
    expect(result.trades[1].tradeDate).toBe('2026-09-03');
    expect(result.trades[1].cashAfter).toBe(100000);
    expect(result.trades[1].lastBuyTradeDate).toBeNull();
  });
});

describe('空仓卖 / 持仓买忽略', () => {
  it('⑯空仓 sell → no_position；持仓中 buy → already_holding（快照不变）', () => {
    const bars = [
      bar('2026-09-01', 10),
      bar('2026-09-02', 10),
      bar('2026-09-03', 10)
    ];
    const result = run(bars, [
      { date: '2026-09-01', action: 'sell' }, // 空仓卖
      { date: '2026-09-01', action: 'buy' }, // 成交
      { date: '2026-09-02', action: 'buy' } // 持仓买 → 忽略
    ]);
    expect(result.trades).toHaveLength(3);
    expect(result.trades[0]).toMatchObject({ signalAction: 'sell', status: 'skipped', skipReason: 'no_position', cashAfter: 100000, positionAfter: 0 });
    expect(result.trades[1]).toMatchObject({ signalAction: 'buy', status: 'filled', shares: 10000, cashAfter: 0 });
    expect(result.trades[2]).toMatchObject({ signalAction: 'buy', status: 'skipped', skipReason: 'already_holding', tradeDate: '2026-09-03', price: 10, cashAfter: 0, positionAfter: 10000, lastBuyTradeDate: '2026-09-02' });
  });
});

describe('同日先卖后买（腾资金）', () => {
  it('⑰输入 [sell, buy] 同日：卖单先成交释放现金，买单用释放后现金成交', () => {
    const bars = [
      bar('2026-09-01', 10),
      bar('2026-09-02', 10),
      bar('2026-09-03', 10)
    ];
    const result = run(bars, [
      { date: '2026-09-01', action: 'buy' }, // d1 全仓成交，cash=0
      { date: '2026-09-02', action: 'sell' }, // 先卖：d2 清仓 cash=100000
      { date: '2026-09-02', action: 'buy' } // 后买：用释放的现金 d2 再全仓
    ]);
    expect(result.trades).toHaveLength(3);
    expect(result.trades[1]).toMatchObject({ signalAction: 'sell', status: 'filled', tradeDate: '2026-09-03', cashAfter: 100000, positionAfter: 0, lastBuyTradeDate: null });
    expect(result.trades[2]).toMatchObject({ signalAction: 'buy', status: 'filled', tradeDate: '2026-09-03', shares: 10000, cashAfter: 0, lastBuyTradeDate: '2026-09-03' });
  });
});

describe('整手取整与资金不足', () => {
  it('⑱整手向下取整：cash=100000/open=10.5 → 9500 股；cash=150/open=11 → 不足一手 skip', () => {
    const rounded = run([bar('2026-09-01', 10.5), bar('2026-09-02', 10.5)], [
      { date: '2026-09-01', action: 'buy' }
    ]);
    expect(rounded.trades[0].shares).toBe(9500);

    const tooPoor = run(
      [bar('2026-09-01', 11), bar('2026-09-02', 11)],
      [{ date: '2026-09-01', action: 'buy' }],
      config({ initialCash: 150 })
    );
    expect(tooPoor.trades[0]).toMatchObject({ status: 'skipped', skipReason: 'insufficient_funds', tradeDate: '2026-09-02', price: 11, shares: 0, cashAfter: 150, positionAfter: 0 });
  });

  it('⑲恰好一手边界：cash=1100/open=11 → 100 股成交、现金归 0 不透支', () => {
    const result = run(
      [bar('2026-09-01', 11), bar('2026-09-02', 11)],
      [{ date: '2026-09-01', action: 'buy' }],
      config({ initialCash: 1100 })
    );
    expect(result.trades[0]).toMatchObject({ status: 'filled', shares: 100, gross: 1100, cashAfter: 0 });
  });
});

describe('最低佣金现金递减不透支', () => {
  const commissionCfg = (initialCash: number) =>
    config({ initialCash, cost: { commissionRate: 0.0003, minCommission: 5, stampTaxRate: 0, slippageRate: 0 } });

  it('⑳含最低佣金现金为负 → 逐手递减：200→100 股，现金 999 ≥ 0', () => {
    // lots 初始 200：cost=2000+max(0.6,5)=2005 > 2004 → 递减 100：cost=1000+5=1005 ≤ 2004
    const result = run(
      [bar('2026-09-01', 10), bar('2026-09-02', 10)],
      [{ date: '2026-09-01', action: 'buy' }],
      commissionCfg(2004)
    );
    expect(result.trades[0]).toMatchObject({ status: 'filled', shares: 100, fee: 5, cashAfter: 999 });
  });

  it('㉑无需递减的对照：cash=2008 → 200 股成交', () => {
    const result = run(
      [bar('2026-09-01', 10), bar('2026-09-02', 10)],
      [{ date: '2026-09-01', action: 'buy' }],
      commissionCfg(2008)
    );
    expect(result.trades[0]).toMatchObject({ status: 'filled', shares: 200, fee: 5, cashAfter: 3 });
  });

  it('㉒递减到不足一手 → insufficient_funds：cash=1004', () => {
    // lots 初始 100：cost=1005 > 1004 → 递减 0 → <100 skip
    const result = run(
      [bar('2026-09-01', 10), bar('2026-09-02', 10)],
      [{ date: '2026-09-01', action: 'buy' }],
      commissionCfg(1004)
    );
    expect(result.trades[0]).toMatchObject({ status: 'skipped', skipReason: 'insufficient_funds', shares: 0, cashAfter: 1004 });
  });
});

describe('滑点方向（内核层 price 与 filledPrice 分离）', () => {
  it('㉓price=原始 open、filledPrice=滑点价：buy 10×1.001=10.01、sell 10×0.999=9.99', () => {
    const cfg = config({ cost: { commissionRate: 0, minCommission: 0, stampTaxRate: 0, slippageRate: 0.001 } });
    const bars = [
      bar('2026-09-01', 10),
      bar('2026-09-02', 10),
      bar('2026-09-03', 10)
    ];
    const result = run(bars, [
      { date: '2026-09-01', action: 'buy' },
      { date: '2026-09-02', action: 'sell' }
    ], cfg);
    const buy = result.trades[0];
    expect(buy.price).toBe(10);
    expect(buy.filledPrice).toBeCloseTo(10.01, 10);
    expect(buy.shares).toBe(9900); // floor(100000/(10.01)/100)×100
    expect(buy.gross).toBeCloseTo(99099, 6);
    const sell = result.trades[1];
    expect(sell.price).toBe(10);
    expect(sell.filledPrice).toBeCloseTo(9.99, 10);
    expect(sell.gross).toBeCloseTo(98901, 6); // 9900×9.99
    expect(sell.cashAfter).toBeCloseTo(99802, 6); // 买入后残余现金 901 + 卖出净所得 98901
  });
});

describe('信号丢弃与净值曲线形状', () => {
  it('㉔date 不在 bar 序列的信号静默丢弃（无记录、无成交）', () => {
    const result = run([bar('2026-09-01', 10), bar('2026-09-02', 10)], [
      { date: '2020-01-01', action: 'buy' }
    ]);
    expect(result.trades).toEqual([]);
    expect(result.equityCurve.map((p) => p.equity)).toEqual([100000, 100000]);
  });

  it('㉕净值逐交易日一点、与 bar 序列对齐；config 原样回显', () => {
    const cfg = config({ initialCash: 50000 });
    const result = run(
      [bar('2026-09-01', 10), bar('2026-09-02', 11), bar('2026-09-03', 12)],
      [],
      cfg
    );
    expect(result.equityCurve.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    // 空仓时 equity = cash + 0×close：净值不随 close 变，恒 50000（末点净值公式的退化情形）
    expect(result.equityCurve.map((p) => p.equity)).toEqual([50000, 50000, 50000]);
    expect(result.equityCurve.map((p) => p.close)).toEqual([10, 11, 12]);
    expect(result.config).toBe(cfg);
  });
});
