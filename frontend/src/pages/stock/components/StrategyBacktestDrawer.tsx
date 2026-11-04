// 策略回测报告 Drawer（单标的与轮动共用）：打开即调 backtestStrategy 拉报告，
// 结构照 BacktestPanel 范式——口径声明区（BACKTEST_DECLARATIONS 四条 + 模拟盘口径两条）→
// 数据区间/生效参数行 → 限额重跑工具条 → 绩效指标卡（轮动附「按标的分组配对」口径声明行）→
// 净值/回撤双图 → 逐笔明细 SelfTable（轮动多「标的」列，skipReason Tag 含组合层 no_bar 码）。
// 复用 backtestUI.ts 导出：buildNetValueSeries/buildDrawdownSeries/fmtPct/fmtNum/fmtMoney/
// formatConfigSummary/skipReasonTagMeta；no_bar 由 strategyUI.strategySkipReasonTagMeta 扩展。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Collapse from 'antd/es/collapse';
import Drawer from 'antd/es/drawer';
import InputNumber from 'antd/es/input-number';
import { Col, Row } from 'antd/es/grid';
import Spin from 'antd/es/spin';
import Statistic from 'antd/es/statistic';
import Tag from 'antd/es/tag';
import type { ColumnsType } from 'antd/es/table';
import { PlayCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import {
  backtestStrategy,
  type PortfolioBacktestRunResult,
  type PortfolioTradeRecord,
  type StrategyBacktestResponse
} from '../../../api/strategy';
import { SelfTable } from '../../../components/base/SelfTable';
import { useApiMessage } from '../../../hooks/useApiMessage';
import type { EquityPoint } from '../../../api/backtest';
import {
  ACTION_LABELS,
  BACKTEST_DECLARATION_TITLES,
  BACKTEST_DECLARATIONS,
  buildDrawdownSeries,
  buildNetValueSeries,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtPctPlain,
  formatConfigSummary
} from '../backtestUI';
import {
  ROTATION_METRIC_NOTE,
  SIM_DECLARATIONS,
  SIM_DECLARATION_TITLES,
  fmtShares,
  strategySkipReasonTagMeta
} from '../strategyUI';

const DEFAULT_LIMIT = 500;
const CHART_HEIGHT = 380;

// 指标卡：A 股语义色（红涨绿跌，与 BacktestPanel 同款 CSS var）
const UP_COLOR = 'var(--color-stock-up)';
const DOWN_COLOR = 'var(--color-stock-down)';

const isPortfolio = (result: StrategyBacktestResponse): result is PortfolioBacktestRunResult =>
  'symbols' in result;

const signColor = (v: number | null | undefined): string | undefined => {
  if (v == null || v === 0 || !Number.isFinite(v)) {
    return undefined;
  }
  return v > 0 ? UP_COLOR : DOWN_COLOR;
};

// 净值/回撤双图 option：双 grid 上下布局 + 联动 dataZoom（照 BacktestPanel.tsx:91-208 同款布局）
const buildChartOption = (dates: string[], netValues: number[], drawdowns: number[], curve: EquityPoint[]) => {
  const zoomStart = dates.length > 120 ? 100 - (120 / dates.length) * 100 : 0;
  const NV = '#1677ff';
  const DD = '#fa8c16';
  const tipRow = (label: string, value: string) =>
    `<div style="font-size:12px;line-height:18px"><span style="display:inline-block;min-width:44px;color:#8c8c8c">${label}</span><span style="font-weight:500">${value}</span></div>`;

  return {
    animation: false,
    tooltip: {
      trigger: 'axis' as const,
      confine: true,
      formatter: (params: Array<{ dataIndex?: number }>) => {
        const i = params?.[0]?.dataIndex;
        if (typeof i !== 'number' || i < 0) {
          return '';
        }
        const point = curve[i];
        if (!point) {
          return '';
        }
        const nv = netValues[i];
        const dd = drawdowns[i];
        const rows = [
          `<div style="font-size:11px;color:#8c8c8c;margin-bottom:2px">${point.date}</div>`,
          tipRow('净值', nv == null || !Number.isFinite(nv) ? '--' : nv.toFixed(4)),
          tipRow('回撤', dd == null || !Number.isFinite(dd) ? '--' : `${(dd * 100).toFixed(2)}%`),
          tipRow('权益', fmtMoney(point.equity)),
          tipRow('现金', fmtMoney(point.cash)),
          tipRow('持仓', `${point.shares} 股`),
          tipRow('收盘', fmtNum(point.close))
        ];
        // 组合层净值点带市值（现金+Σ持仓市值），多一行
        if ('marketValue' in point && typeof point.marketValue === 'number') {
          rows.splice(5, 0, tipRow('市值', fmtMoney(point.marketValue)));
        }
        return rows.join('');
      }
    },
    legend: { top: 0, data: ['净值(归一化)', '回撤'] },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 12, right: 58, top: 30, height: '52%' },
      { left: 12, right: 58, top: '68%', height: '18%' }
    ],
    xAxis: [
      { type: 'category', data: dates, gridIndex: 0, show: false, boundaryGap: false },
      {
        type: 'category',
        data: dates,
        gridIndex: 1,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { color: '#8c8c8c', fontSize: 10 }
      }
    ],
    yAxis: [
      {
        scale: true,
        position: 'right',
        gridIndex: 0,
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#8c8c8c', fontSize: 10 }
      },
      {
        position: 'right',
        gridIndex: 1,
        min: 0,
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#8c8c8c', fontSize: 10, formatter: (v: number) => `${(v * 100).toFixed(0)}%` }
      }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: zoomStart, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], bottom: 4, height: 16, start: zoomStart, end: 100 }
    ],
    series: [
      {
        name: '净值(归一化)',
        type: 'line',
        data: netValues,
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 1.5, color: NV },
        itemStyle: { color: NV },
        markLine: {
          silent: true,
          symbol: 'none',
          animation: false,
          lineStyle: { type: 'dashed', color: '#8c8c8c', width: 1 },
          label: { formatter: '初始净值=1', position: 'insideStartTop', color: '#8c8c8c', fontSize: 10 },
          data: [{ yAxis: 1 }]
        }
      },
      {
        name: '回撤',
        type: 'line',
        data: drawdowns,
        xAxisIndex: 1,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { width: 1, color: DD },
        itemStyle: { color: DD },
        areaStyle: { color: 'rgba(250, 140, 22, 0.25)' }
      }
    ]
  };
};

interface Props {
  open: boolean;
  strategyId: number | null;
  strategyName: string;
  onClose: () => void;
}

export const StrategyBacktestDrawer: React.FC<Props> = ({ open, strategyId, strategyName, onClose }) => {
  const msg = useApiMessage();
  const [limit, setLimit] = useState<number | null>(DEFAULT_LIMIT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StrategyBacktestResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    if (!strategyId) {
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      setResult(await backtestStrategy(strategyId, { limit: limit ?? undefined }));
    } catch (error) {
      // 422（bars 不足/参数越界）后端文案直显
      msg.errorFrom(error, '策略回测运行失败');
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [strategyId, limit, msg]);

  // 打开即拉报告；切换策略时清旧报告重跑
  useEffect(() => {
    if (open && strategyId != null) {
      setResult(null);
      setFailed(false);
      void run();
    } else if (!open) {
      setResult(null);
      setFailed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, strategyId]);

  const portfolio = useMemo(() => (result && isPortfolio(result) ? result : null), [result]);

  // 统一逐笔行类型：单标的补 symbol 维度（轮动原样），列渲染共用
  const tradeRows = useMemo<PortfolioTradeRecord[]>(() => {
    if (!result) {
      return [];
    }
    if (portfolio) {
      return portfolio.trades;
    }
    return (result as Exclude<StrategyBacktestResponse, PortfolioBacktestRunResult>).trades.map((trade) => ({
      ...trade,
      symbol: (result as { symbol: string }).symbol
    }));
  }, [result, portfolio]);

  const chartOption = useMemo(() => {
    if (!result || result.equityCurve.length === 0) {
      return null;
    }
    const dates = result.equityCurve.map((point) => point.date);
    const netValues = buildNetValueSeries(result.equityCurve, result.config.initialCash);
    const drawdowns = buildDrawdownSeries(result.equityCurve);
    return buildChartOption(dates, netValues, drawdowns, result.equityCurve);
  }, [result]);

  const metricCards = useMemo(() => {
    const m = result?.metrics;
    if (!m) {
      return [];
    }
    return [
      { title: '总收益率', value: fmtPct(m.totalReturn), color: signColor(m.totalReturn) },
      { title: '年化收益', value: fmtPct(m.annualizedReturn), color: signColor(m.annualizedReturn) },
      { title: '最大回撤', value: fmtPct(m.maxDrawdown), color: m.maxDrawdown > 0 ? DOWN_COLOR : undefined },
      { title: '夏普比率', value: fmtNum(m.sharpe) },
      { title: '胜率', value: fmtPctPlain(m.winRate) },
      { title: '卡玛比率', value: fmtNum(m.calmar) }
    ];
  }, [result]);

  const skippedCount = useMemo(
    () => tradeRows.filter((trade) => trade.status === 'skipped').length,
    [tradeRows]
  );

  // 逐笔明细列：轮动模式首列多「标的」（契约口径）；单标的模板 symbol 恒为回测标的不显该列
  const tradeColumns = useMemo<ColumnsType<PortfolioTradeRecord>>(() => {
    const symbolColumn: ColumnsType<PortfolioTradeRecord>[number] = {
      title: '标的',
      dataIndex: 'symbol',
      width: 100,
      render: (v: string) => <span className="font-mono">{v?.toUpperCase?.() ?? '--'}</span>
    };
    return [
      ...(portfolio ? [symbolColumn] : []),
      { title: '信号日', dataIndex: 'signalDate', width: 105 },
      {
        title: '信号',
        dataIndex: 'signalAction',
        width: 70,
        render: (v: PortfolioTradeRecord['signalAction']) => (
          <Tag color={v === 'buy' ? 'red' : 'green'}>{ACTION_LABELS[v]}</Tag>
        )
      },
      {
        title: '状态',
        key: 'status',
        width: 150,
        render: (_: unknown, row: PortfolioTradeRecord) => {
          if (row.status === 'filled') {
            return <Tag color="blue">成交</Tag>;
          }
          // skipped 显原因 Tag：码集=内核九码+组合层 no_bar（无行情/停牌缺日），未知码兜底回显原码
          if (row.skipReason) {
            const meta = strategySkipReasonTagMeta(row.skipReason);
            return <Tag color={meta.color}>{meta.text}</Tag>;
          }
          return <Tag>跳过</Tag>;
        }
      },
      { title: '成交日', dataIndex: 'tradeDate', width: 105, render: (v: string | null) => v ?? '--' },
      { title: '成交价', dataIndex: 'price', width: 90, render: (v: number | null) => fmtNum(v) },
      { title: '含滑点价', dataIndex: 'filledPrice', width: 95, render: (v: number | null) => fmtNum(v) },
      { title: '股数', dataIndex: 'shares', width: 80, render: (v: number) => fmtShares(v) },
      { title: '成交额', dataIndex: 'gross', width: 110, render: (v: number | null) => fmtMoney(v) },
      { title: '费用', dataIndex: 'fee', width: 90, render: (v: number | null) => fmtMoney(v) },
      { title: '成交后现金', dataIndex: 'cashAfter', width: 115, render: (v: number) => fmtMoney(v) },
      { title: '持仓(股)', dataIndex: 'positionAfter', width: 90, render: (v: number) => fmtShares(v) }
    ];
  }, [portfolio]);

  const dataRange = useMemo(() => {
    if (!result) {
      return '';
    }
    const symbolsText = portfolio ? portfolio.symbols.join(' / ') : (result as { symbol: string }).symbol;
    return `${symbolsText.toUpperCase()} · 数据区间 ${result.firstDate ?? '-'} ~ ${result.lastDate ?? '-'} · 共 ${result.barsCount} 根`;
  }, [result, portfolio]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1080}
      title={`回测报告 · ${strategyName}`}
      destroyOnClose
    >
      <div className="flex flex-col gap-3">
        {/* 口径声明区：回测四条（复权/涨跌停停牌/T+1 记账/幸存者偏差）+ 模拟盘两条（r4 影子账户/收盘盯市） */}
        <Alert
          type="warning"
          showIcon
          message="回测与模拟盘口径声明（解读结果前必读）"
          description={
            <Collapse
              ghost
              defaultActiveKey={['sim']}
              items={[
                ...BACKTEST_DECLARATIONS.map((text, index) => ({
                  key: `bt-${index}`,
                  label: BACKTEST_DECLARATION_TITLES[index],
                  children: <div className="text-xs leading-6 text-text-sub">{text}</div>
                })),
                ...SIM_DECLARATIONS.map((text, index) => ({
                  key: `sim-${index}`,
                  label: SIM_DECLARATION_TITLES[index],
                  children: <div className="text-xs leading-6 text-text-sub">{text}</div>
                }))
              ]}
            />
          }
        />

        {/* 数据区间/生效参数（实际生效成本回显：模拟盘固定 DEFAULT_COST，回测端点可覆盖） */}
        {result && (
          <div className="text-xs text-text-sub">
            {dataRange} · 生效参数：{formatConfigSummary(result.config)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">取末 N 根 K 线</span>
          <InputNumber
            min={10}
            max={2000}
            step={50}
            value={limit}
            onChange={(v) => setLimit(v)}
            placeholder="500"
            style={{ width: 110 }}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={loading}
            onClick={() => void run()}
          >
            重新回测
          </Button>
          <span className="text-xs text-text-sub">
            轮动调仓序数锚日=max(sim_start_date, 本次窗口首日)；limit 截断时窗口首日晚于起点，
            调仓相位与模拟盘可能不一致——回测为报告口径，撮合路径与模拟盘一致
          </span>
        </div>

        {loading && !result && (
          <div className="py-10 text-center">
            <Spin size="large" />
            <div className="text-sm text-text-sub mt-2">回测运行中…</div>
          </div>
        )}

        {!loading && !result && failed && (
          <div className="py-6 text-center text-sm text-text-sub">回测失败，请调整取数根数后重试。</div>
        )}

        {result && (
          <>
            {/* 绩效指标卡：六卡（null 显 '--'）；轮动模式附分组配对口径声明行 */}
            <div>
              <Row gutter={[12, 12]}>
                {metricCards.map((card) => (
                  <Col key={card.title} xs={12} sm={8} md={4}>
                    <Statistic
                      title={card.title}
                      value={card.value}
                      valueStyle={{ fontSize: 18, ...(card.color ? { color: card.color } : {}) }}
                    />
                  </Col>
                ))}
              </Row>
              {portfolio && <div className="text-xs text-text-sub mt-2">{ROTATION_METRIC_NOTE}</div>}
            </div>

            {chartOption && (
              <div>
                <div className="text-sm font-medium mb-1">净值与回撤</div>
                <ReactECharts option={chartOption} style={{ height: CHART_HEIGHT, width: '100%' }} notMerge lazyUpdate />
              </div>
            )}

            <SelfTable
              rowKey={(row: PortfolioTradeRecord) =>
                `${row.symbol}:${row.signalDate}:${row.signalAction}:${row.tradeDate ?? 'na'}`
              }
              size="small"
              columns={tradeColumns}
              dataSource={tradeRows}
              pagination={
                tradeRows.length > 50
                  ? { pageSize: 50, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (t) => `共 ${t} 条` }
                  : false
              }
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: '无交易记录（信号未产生成交或全部被跳过）' }}
            />
            <div className="text-xs text-text-sub">
              成交 {result.metrics.tradeCount} 笔 · 跳过 {skippedCount} 笔 · 已平仓 {result.metrics.roundTripCount} 回合
              （skipped 含组合层 no_bar：信号日该标的无 bar 行，真实停牌整行缺失，由重放器显式记录）
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
};
