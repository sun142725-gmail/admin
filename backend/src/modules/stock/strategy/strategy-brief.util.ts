// 策略圆桌简报纯函数（方案 §5）：renderStrategyBriefText 把回测绩效 + 当前信号摘要 + 持仓快照
// + 账户拼成分段简报文本，喂既有 buildRound1Prompt（experts.definitions.ts:404）——
// 专家管线、SSE、turn 落库、replayFromDb 回放原样复用，零 AI 基建新增。
// 无 I/O、不依赖 Nest 容器、不 import @nestjs/*。单测 test/strategy-brief.spec.ts。
import { BacktestMetrics } from '../backtest/backtest.types';

/** 简报输入部件（全部可缺省降级：策略未跑过模拟盘时绩效/信号/持仓/账户为空段落）。 */
export interface StrategyBriefParts {
  strategyName: string;
  templateLabel: string;
  /** 参数快照（已合并 defaultParams 的生效值）。 */
  params: Record<string, unknown>;
  symbols: string[];
  /** 重放正式段起点（configs.sim_start_date）。 */
  simStartDate: string | null;
  enabled: boolean;
  /** 重放回测绩效（现场重算一次，纯本地毫秒级不触网）；未跑过 → null。 */
  metrics: BacktestMetrics | null;
  /** 重放窗口（bars 区间）。 */
  barsRange: { firstDate: string | null; lastDate: string | null; barsCount: number } | null;
  recentSignals: Array<{
    tradeDate: string;
    symbol: string;
    action: string;
    status: string;
    skipReason: string | null;
  }>;
  /** 信号来源：sim=模拟盘落库（缺省）；backtest=模拟盘尚未落信号，回落展示回测重算最近成交。 */
  recentSignalsSource?: 'sim' | 'backtest';
  positions: Array<{
    symbol: string;
    status: string;
    shares: number;
    avgCost: number | null;
    lastPrice: number | null;
    marketValue: number | null;
    unrealizedPnl: number | null;
  }>;
  account: {
    cash: number | null;
    equity: number | null;
    marketValue: number | null;
    replayedThrough: string | null;
    lastRunStatus: string | null;
    lastRunError: string | null;
  } | null;
  /** 轮动模板（etf-momentum）：绩效附「回合按标的分组配对」口径声明。 */
  rotation: boolean;
}

/** 模拟盘口径声明（briefJson.declaration.simulation 与简报固定段落共用）。 */
export const SIM_DECLARATION_LINES: string[] = [
  '模拟盘=重放式投影：每次调度把策略从「固定锚预热段+正式段」窗口重喂信号函数与撮合内核，结果投影落库；改参数/换池/改起点后下一轮按新口径全量重建投影（影子账户语义，不做历史冻结）。',
  '折叠范围为全窗口经济事件：预热段建仓等经济后果计入影子账户（持仓可早于正式段起点、账户起点净值≠初始资金）；预热段信号行不落库（信号列表不可见但其经济后果在持仓与账户中）。',
  '盯市口径：日线收盘盯市，净值=现金+Σ持仓市值；当日 K 线未落库时重放以库内最新 bar 为界，该日信号/盯市顺延下轮不丢日。'
];

/** 轮动模板绩效口径声明（briefJson.declaration.rotationPairing 与绩效段共用）。 */
export const ROTATION_PAIRING_DECLARATION =
  '口径声明：轮动模板的回合按标的分组配对计算胜率/盈亏比/回合数（holdTop≥2 交错成交下全序配对会错配）。';

const fmtPct = (ratio: number | null | undefined): string =>
  ratio == null || !Number.isFinite(ratio) ? '--' : `${(ratio * 100).toFixed(2)}%`;

const fmtMoney = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? '--' : value.toFixed(2);

const fmtParamLine = (params: Record<string, unknown>): string =>
  Object.keys(params)
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join(', ');

/** 策略简报文本：段落 = 策略概况 / 回测绩效 / 最新信号 / 持仓快照 / 账户 / 模拟盘口径声明。 */
export function renderStrategyBriefText(parts: StrategyBriefParts): string {
  const sections: string[] = [];

  sections.push(
    [
      `【策略概况】`,
      `策略名：${parts.strategyName}`,
      `模板：${parts.templateLabel}`,
      `参数：${fmtParamLine(parts.params) || '默认'}`,
      `标的池：${parts.symbols.length > 0 ? parts.symbols.join('、') : '未配置'}`,
      `正式段起点：${parts.simStartDate ?? '未配置'}`,
      `状态：${parts.enabled ? '启用' : '停用'}`
    ].join('\n')
  );

  if (parts.metrics) {
    const m = parts.metrics;
    const lines = [
      `【回测绩效（模拟盘重放口径）】`,
      `重放窗口：${parts.barsRange?.firstDate ?? '--'} ~ ${parts.barsRange?.lastDate ?? '--'}（${parts.barsRange?.barsCount ?? 0} 根）`,
      `累计收益：${fmtPct(m.totalReturn)}；年化：${fmtPct(m.annualizedReturn)}`,
      `最大回撤：${fmtPct(m.maxDrawdown)}；夏普：${Number.isFinite(m.sharpe) ? m.sharpe.toFixed(2) : '--'}`,
      `胜率：${m.winRate == null ? '--' : fmtPct(m.winRate)}；盈亏比：${m.profitLossRatio == null ? '--' : m.profitLossRatio.toFixed(2)}`,
      `成交 ${m.tradeCount} 笔；已平仓回合 ${m.roundTripCount} 个`
    ];
    if (parts.rotation) {
      lines.push(ROTATION_PAIRING_DECLARATION);
    }
    sections.push(lines.join('\n'));
  } else {
    sections.push('【回测绩效（模拟盘重放口径）】\n暂无绩效数据：策略尚未运行过模拟盘重放。');
  }

  if (parts.recentSignals.length > 0) {
    const lines = parts.recentSignals
      .slice(0, 10)
      .map(
        (signal) =>
          `- ${signal.tradeDate} ${signal.symbol} ${signal.action.toUpperCase()} [${signal.status}${
            signal.skipReason ? `/${signal.skipReason}` : ''
          }]`
      );
    const header =
      parts.recentSignalsSource === 'backtest'
        ? '【最新信号（模拟盘尚未落信号，以下为回测重算最近成交）】'
        : '【最新信号】';
    sections.push([header, ...lines].join('\n'));
  } else {
    sections.push('【最新信号】\n暂无信号记录。');
  }

  if (parts.positions.length > 0) {
    const lines = parts.positions.map((position) => {
      if (position.shares > 0) {
        return `- ${position.symbol} 持有 ${position.shares} 股（成本 ${fmtMoney(position.avgCost)}，现价 ${fmtMoney(
          position.lastPrice
        )}，市值 ${fmtMoney(position.marketValue)}，浮动盈亏 ${fmtMoney(position.unrealizedPnl)}）`;
      }
      return `- ${position.symbol} 空仓`;
    });
    sections.push(['【持仓快照】', ...lines].join('\n'));
  } else {
    sections.push('【持仓快照】\n当前无持仓记录（空仓）。');
  }

  if (parts.account) {
    sections.push(
      [
        '【模拟盘账户】',
        `现金：${fmtMoney(parts.account.cash)}；市值：${fmtMoney(parts.account.marketValue)}；净值：${fmtMoney(parts.account.equity)}`,
        `重放截至：${parts.account.replayedThrough ?? '--'}；最近运行：${parts.account.lastRunStatus ?? '--'}${
          parts.account.lastRunError ? `（${parts.account.lastRunError}）` : ''
        }`
      ].join('\n')
    );
  } else {
    sections.push('【模拟盘账户】\n暂无账户投影（策略尚未运行）。');
  }

  // 模拟盘口径声明（uiContract 口径声明区，简报固定段落）
  sections.push(
    ['【模拟盘口径声明】', ...SIM_DECLARATION_LINES.map((line) => `- ${line}`)].join('\n')
  );

  return sections.join('\n\n');
}
