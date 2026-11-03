// 回测面板（选股器页第四 Tab 内容）：服务端内置 MA5/MA20 双均线演示信号的单股回测报告。
// 结构：口径声明区（Alert+Collapse 置顶必读）→ 参数表单卡（symbol 半角校验/初始资金/成本阈值折叠区/
// 仓位模型 Segmented 三选+联动参数）→ 绩效指标卡行 → 净值/回撤双图 → 交易明细 SelfTable。
// 图表：echarts-for-react（KlineChart.tsx:6 同款），净值主图+回撤副图双 grid 多面板布局 + 联动
// dataZoom（inside+slider，照 KlineChart.tsx:302-306,347-363 的多 grid+dataZoom 方式）。
// 懒挂载：antd Tabs 未激活 pane 不渲染 children，首切才拉数据（照 DailyBarsQualityPanel 先例）；
// useApiMessage 报错（422 文案直显），请求期间按钮 loading。
import React, { useCallback, useMemo, useState } from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Collapse from 'antd/es/collapse';
import { Col, Row } from 'antd/es/grid';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Segmented from 'antd/es/segmented';
import Space from 'antd/es/space';
import Statistic from 'antd/es/statistic';
import Tag from 'antd/es/tag';
import type { ColumnsType } from 'antd/es/table';
import { PlayCircleOutlined, UndoOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import {
  runBacktest,
  type BacktestRunResult,
  type PositionModelType,
  type TradeRecord
} from '../../../api/backtest';
import { SelfTable } from '../../../components/base/SelfTable';
import { PageHeader } from '../../../components/business/PageHeader';
import { useApiMessage } from '../../../hooks/useApiMessage';
import {
  ACTION_LABELS,
  BACKTEST_DECLARATION_TITLES,
  BACKTEST_DECLARATIONS,
  SYMBOL_PATTERN,
  buildDrawdownSeries,
  buildNetValueSeries,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtPctPlain,
  formatConfigSummary,
  skipReasonTagMeta
} from '../backtestUI';

// ==================== 表单默认值（与后端 RunBacktestDto 默认值一致） ====================

const DEFAULT_INITIAL_CASH = 100000;
const DEFAULT_LIMIT = 500;
const DEFAULT_LIMIT_UP = 0.1;
const DEFAULT_LIMIT_DOWN = -0.1;
const DEFAULT_LIMIT_EPS = 0.005;
const DEFAULT_COMMISSION_RATE = 0.0003;
const DEFAULT_MIN_COMMISSION = 5;
const DEFAULT_STAMP_TAX_RATE = 0.0005;
const DEFAULT_SLIPPAGE_RATE = 0.001;
const DEFAULT_RATIO = 0.5;
const DEFAULT_RISK_PCT = 0.01;
const DEFAULT_MAX_POSITION_PCT = 1;
const DEFAULT_ATR_PERIOD = 14;

// 双图统一高度（净值主图 + 回撤副图 + dataZoom slider）
const CHART_HEIGHT = 420;

// 指标卡：A 股语义色（红涨绿跌，与 global.css --color-stock-up/down 同值；DOM 内可用 CSS var）
const UP_COLOR = 'var(--color-stock-up)';
const DOWN_COLOR = 'var(--color-stock-down)';

const MODEL_OPTIONS: Array<{ label: string; value: PositionModelType }> = [
  { label: '全仓', value: 'all-in' },
  { label: '固定比例', value: 'fixed-ratio' },
  { label: 'ATR 风险敞口', value: 'atr' }
];

interface MetricCardDef {
  title: string;
  value: string;
  color?: string;
}

const signColor = (v: number | null | undefined): string | undefined => {
  if (v == null || v === 0 || !Number.isFinite(v)) {
    return undefined;
  }
  return v > 0 ? UP_COLOR : DOWN_COLOR;
};

// 净值/回撤双图 option：双 grid 上下布局 + 联动 axisPointer/dataZoom（照 KlineChart 多 grid 方式）
const buildChartOption = (
  dates: string[],
  netValues: number[],
  drawdowns: number[],
  curve: BacktestRunResult['equityCurve']
) => {
  // 默认展示最近约 120 个点（KlineChart 同款策略）
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
        return [
          `<div style="font-size:11px;color:#8c8c8c;margin-bottom:2px">${point.date}</div>`,
          tipRow('净值', nv == null || !Number.isFinite(nv) ? '--' : nv.toFixed(4)),
          tipRow('回撤', dd == null || !Number.isFinite(dd) ? '--' : `${(dd * 100).toFixed(2)}%`),
          tipRow('权益', fmtMoney(point.equity)),
          tipRow('现金', fmtMoney(point.cash)),
          tipRow('持仓', `${point.shares} 股`),
          tipRow('收盘', fmtNum(point.close))
        ].join('');
      }
    },
    legend: { top: 0, data: ['净值(归一化)', '回撤'] },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    // 双 grid：上=净值主图（约 52% 高），下=回撤副图（约 18% 高）；右侧留轴标签空间
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
    // 双面板联动缩放：鼠标滚轮 inside + 底部 slider（KlineChart 同款两段式）
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
        // 基准线 y=1（初始净值）
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

export const BacktestPanel: React.FC = () => {
  const msg = useApiMessage();
  const [symbolText, setSymbolText] = useState('');
  const [initialCash, setInitialCash] = useState<number | null>(DEFAULT_INITIAL_CASH);
  const [limit, setLimit] = useState<number | null>(DEFAULT_LIMIT);
  const [limitUpPct, setLimitUpPct] = useState<number | null>(DEFAULT_LIMIT_UP);
  const [limitDownPct, setLimitDownPct] = useState<number | null>(DEFAULT_LIMIT_DOWN);
  const [limitEps, setLimitEps] = useState<number | null>(DEFAULT_LIMIT_EPS);
  const [commissionRate, setCommissionRate] = useState<number | null>(DEFAULT_COMMISSION_RATE);
  const [minCommission, setMinCommission] = useState<number | null>(DEFAULT_MIN_COMMISSION);
  const [stampTaxRate, setStampTaxRate] = useState<number | null>(DEFAULT_STAMP_TAX_RATE);
  const [slippageRate, setSlippageRate] = useState<number | null>(DEFAULT_SLIPPAGE_RATE);
  const [modelType, setModelType] = useState<PositionModelType>('all-in');
  const [ratio, setRatio] = useState<number | null>(DEFAULT_RATIO);
  const [riskPct, setRiskPct] = useState<number | null>(DEFAULT_RISK_PCT);
  const [maxPositionPct, setMaxPositionPct] = useState<number | null>(DEFAULT_MAX_POSITION_PCT);
  const [atrPeriod, setAtrPeriod] = useState<number | null>(DEFAULT_ATR_PERIOD);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestRunResult | null>(null);

  const onRun = useCallback(async () => {
    const symbol = symbolText.trim();
    // symbol 半角校验前置提示（与后端正则同口径，大写/全角后端 422）
    if (!SYMBOL_PATTERN.test(symbol)) {
      msg.warning('请输入半角小写标准代码：sh600519 / sz300750');
      return;
    }
    setRunning(true);
    try {
      const res = await runBacktest({
        symbol,
        initialCash: initialCash ?? undefined,
        limit: limit ?? undefined,
        limitUpPct: limitUpPct ?? undefined,
        limitDownPct: limitDownPct ?? undefined,
        limitEps: limitEps ?? undefined,
        cost: {
          commissionRate: commissionRate ?? undefined,
          minCommission: minCommission ?? undefined,
          stampTaxRate: stampTaxRate ?? undefined,
          slippageRate: slippageRate ?? undefined
        },
        positionModel:
          modelType === 'fixed-ratio'
            ? { type: 'fixed-ratio', ratio: ratio ?? undefined }
            : modelType === 'atr'
              ? {
                  type: 'atr',
                  riskPct: riskPct ?? undefined,
                  maxPositionPct: maxPositionPct ?? undefined,
                  atrPeriod: atrPeriod ?? undefined
                }
              : { type: 'all-in' }
      });
      setResult(res);
      msg.success(`回测完成：${res.symbol.toUpperCase()} 共 ${res.barsCount} 根 K 线`);
    } catch (error) {
      // 422（参数非法/库内 bars<2）后端文案经 getErrorMessage 直显
      msg.errorFrom(error, '回测运行失败');
    } finally {
      setRunning(false);
    }
  }, [
    symbolText,
    initialCash,
    limit,
    limitUpPct,
    limitDownPct,
    limitEps,
    commissionRate,
    minCommission,
    stampTaxRate,
    slippageRate,
    modelType,
    ratio,
    riskPct,
    maxPositionPct,
    atrPeriod,
    msg
  ]);

  const onReset = () => {
    setSymbolText('');
    setInitialCash(DEFAULT_INITIAL_CASH);
    setLimit(DEFAULT_LIMIT);
    setLimitUpPct(DEFAULT_LIMIT_UP);
    setLimitDownPct(DEFAULT_LIMIT_DOWN);
    setLimitEps(DEFAULT_LIMIT_EPS);
    setCommissionRate(DEFAULT_COMMISSION_RATE);
    setMinCommission(DEFAULT_MIN_COMMISSION);
    setStampTaxRate(DEFAULT_STAMP_TAX_RATE);
    setSlippageRate(DEFAULT_SLIPPAGE_RATE);
    setModelType('all-in');
    setRatio(DEFAULT_RATIO);
    setRiskPct(DEFAULT_RISK_PCT);
    setMaxPositionPct(DEFAULT_MAX_POSITION_PCT);
    setAtrPeriod(DEFAULT_ATR_PERIOD);
  };

  // 净值/回撤序列与 option：仅在 result 就绪时构建
  const chartOption = useMemo(() => {
    if (!result || result.equityCurve.length === 0) {
      return null;
    }
    const dates = result.equityCurve.map((point) => point.date);
    const netValues = buildNetValueSeries(result.equityCurve, result.config.initialCash);
    const drawdowns = buildDrawdownSeries(result.equityCurve);
    return buildChartOption(dates, netValues, drawdowns, result.equityCurve);
  }, [result]);

  // 绩效指标卡定义（null → '--'；收益类带 A 股语义色）
  const metricCards = useMemo<MetricCardDef[]>(() => {
    const m = result?.metrics;
    if (!m) {
      return [];
    }
    return [
      { title: '总收益率', value: fmtPct(m.totalReturn), color: signColor(m.totalReturn) },
      { title: '年化收益', value: fmtPct(m.annualizedReturn), color: signColor(m.annualizedReturn) },
      { title: '最大回撤', value: fmtPct(m.maxDrawdown), color: m.maxDrawdown > 0 ? DOWN_COLOR : undefined },
      { title: '最长回撤天数', value: `${m.longestDrawdownDays} 天` },
      { title: '夏普比率', value: fmtNum(m.sharpe) },
      { title: '卡玛比率', value: fmtNum(m.calmar) },
      { title: '胜率', value: fmtPctPlain(m.winRate) },
      { title: '盈亏比', value: fmtNum(m.profitLossRatio) },
      { title: '换手率(年化,双侧)', value: fmtPctPlain(m.turnover) },
      { title: '交易数(成交)', value: String(m.tradeCount) },
      { title: '已平仓回合', value: String(m.roundTripCount) }
    ];
  }, [result]);

  // 交易明细列（v3 skipped 行渲染依据：成交价=price（T+1 open，bar 存在时；no_next_bar null→'--'），
  // 含滑点价/成交额/费用 null→'--'，股数 0，快照三列照常展示）
  const tradeColumns = useMemo<ColumnsType<TradeRecord>>(
    () => [
      { title: '信号日', dataIndex: 'signalDate', width: 105 },
      {
        title: '信号',
        dataIndex: 'signalAction',
        width: 70,
        render: (v: TradeRecord['signalAction']) => <Tag color={v === 'buy' ? 'red' : 'green'}>{ACTION_LABELS[v]}</Tag>
      },
      {
        title: '状态',
        key: 'status',
        width: 140,
        render: (_: unknown, row: TradeRecord) => {
          if (row.status === 'filled') {
            return <Tag color="blue">成交</Tag>;
          }
          // skipped 显原因：skipReason 为响应契约外可选回填字段——有则显原因 Tag（未知码兜底回显原码），
          // 契约未回填时回退通用「跳过」
          if (row.skipReason) {
            const meta = skipReasonTagMeta(row.skipReason);
            return <Tag color={meta.color}>{meta.text}</Tag>;
          }
          return <Tag>跳过</Tag>;
        }
      },
      { title: '成交日', dataIndex: 'tradeDate', width: 105, render: (v: string | null) => v ?? '--' },
      { title: '成交价', dataIndex: 'price', width: 90, render: (v: number | null) => fmtNum(v) },
      { title: '含滑点价', dataIndex: 'filledPrice', width: 95, render: (v: number | null) => fmtNum(v) },
      { title: '股数', dataIndex: 'shares', width: 80 },
      { title: '成交额', dataIndex: 'gross', width: 110, render: (v: number | null) => fmtMoney(v) },
      { title: '费用', dataIndex: 'fee', width: 90, render: (v: number | null) => fmtMoney(v) },
      { title: '成交后现金', dataIndex: 'cashAfter', width: 115, render: (v: number) => fmtMoney(v) },
      { title: '持仓(股)', dataIndex: 'positionAfter', width: 90 }
    ],
    []
  );

  const skippedCount = useMemo(
    () => (result ? result.trades.filter((trade) => trade.status === 'skipped').length : 0),
    [result]
  );

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="回测"
        subtitle="内置 MA5/MA20 双均线演示信号的单股回测：T 日信号次一交易日开盘成交，输出净值曲线/回撤/绩效指标与逐笔明细。"
      />

      {/* 口径声明区置顶（复权/涨跌停停牌/T+1 记账/幸存者偏差四条，UI 契约要求必读） */}
      <Alert
        type="warning"
        showIcon
        message="回测口径与偏差声明（解读结果前必读）"
        description={
          <Collapse
            ghost
            defaultActiveKey={['0']}
            items={BACKTEST_DECLARATIONS.map((text, index) => ({
              key: String(index),
              label: BACKTEST_DECLARATION_TITLES[index],
              children: <div className="text-xs leading-6 text-text-sub">{text}</div>
            }))}
          />
        }
      />

      {/* 生效参数回显：口径声明区直接展示本次实际生效参数与数据区间 */}
      {result && (
        <div className="text-xs text-text-sub">
          本次实际生效：{formatConfigSummary(result.config)} · 数据区间 {result.firstDate ?? '-'} ~{' '}
          {result.lastDate ?? '-'} · 共 {result.barsCount} 根
        </div>
      )}

      <Card
        size="small"
        title="回测参数"
        extra={
          <Space>
            <Button size="small" icon={<UndoOutlined />} onClick={onReset}>
              恢复默认
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={running}
              onClick={() => void onRun()}
            >
              运行回测
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Row gutter={12}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item
                label="股票代码"
                required
                style={{ marginBottom: 8 }}
                help="半角小写 ^(sh|sz)\d{6}$，如 sh600519；大写/全角会被拒绝（422）"
              >
                <Input
                  className="font-mono"
                  placeholder="sh600519"
                  maxLength={8}
                  allowClear
                  value={symbolText}
                  onChange={(e) => setSymbolText(e.target.value)}
                  onPressEnter={() => void onRun()}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item label="初始资金（元）" style={{ marginBottom: 8 }} help="默认 100,000；须 > 0">
                <InputNumber
                  className="!w-full"
                  min={1}
                  step={10000}
                  value={initialCash}
                  onChange={(v) => setInitialCash(v)}
                  placeholder="100000"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item label="取末 N 根 K 线" style={{ marginBottom: 8 }} help="默认 500（10~2000），取日线库末 N 根">
                <InputNumber
                  className="!w-full"
                  min={10}
                  max={2000}
                  step={50}
                  value={limit}
                  onChange={(v) => setLimit(v)}
                  placeholder="500"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Form.Item label="仓位模型" style={{ marginBottom: 8 }} help="只决定买入预算；股数整手取整与费用约束由内核统一处理">
                <Segmented value={modelType} onChange={(value) => setModelType(value as PositionModelType)} options={MODEL_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          {/* 仓位模型联动参数 */}
          <Row gutter={12}>
            {modelType === 'fixed-ratio' && (
              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item label="固定仓位比例 ratio" style={{ marginBottom: 8 }} help="(0, 1]：买入预算 = min(权益×ratio, 现金)">
                  <InputNumber
                    className="!w-full"
                    min={0.01}
                    max={1}
                    step={0.05}
                    value={ratio}
                    onChange={(v) => setRatio(v)}
                    placeholder="0.5"
                  />
                </Form.Item>
              </Col>
            )}
            {modelType === 'atr' && (
              <>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item label="单股风险比 riskPct" style={{ marginBottom: 8 }} help="默认 0.01，(0, 0.1]：单股风险预算占权益比（1×ATR）">
                    <InputNumber
                      className="!w-full"
                      min={0.001}
                      max={0.1}
                      step={0.005}
                      value={riskPct}
                      onChange={(v) => setRiskPct(v)}
                      placeholder="0.01"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item label="仓位上限 maxPositionPct" style={{ marginBottom: 8 }} help="默认 1，(0, 1]：买入预算上限占权益比">
                    <InputNumber
                      className="!w-full"
                      min={0.05}
                      max={1}
                      step={0.1}
                      value={maxPositionPct}
                      onChange={(v) => setMaxPositionPct(v)}
                      placeholder="1"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item label="ATR 周期 atrPeriod" style={{ marginBottom: 8 }} help="默认 14，[2, 60]：ATR 回看根数">
                    <InputNumber
                      className="!w-full"
                      min={2}
                      max={60}
                      step={1}
                      value={atrPeriod}
                      onChange={(v) => setAtrPeriod(v)}
                      placeholder="14"
                    />
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>

          {/* 成本/阈值折叠区（默认收起，均有后端默认值；清空输入即回落默认） */}
          <Collapse
            ghost
            items={[
              {
                key: 'cost-limit',
                label: '成本与阈值（高级参数，均有默认值；清空输入回落默认）',
                children: (
                  <Row gutter={12}>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="涨停阈值 limitUpPct" style={{ marginBottom: 8 }} help="默认 0.10，(0, 0.5]；单一阈值不分板块/历史制度">
                        <InputNumber
                          className="!w-full"
                          min={0.001}
                          max={0.5}
                          step={0.05}
                          value={limitUpPct}
                          onChange={(v) => setLimitUpPct(v)}
                          placeholder="0.10"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="跌停阈值 limitDownPct" style={{ marginBottom: 8 }} help="默认 -0.10，[-0.5, 0)">
                        <InputNumber
                          className="!w-full"
                          min={-0.5}
                          max={-0.001}
                          step={0.05}
                          value={limitDownPct}
                          onChange={(v) => setLimitDownPct(v)}
                          placeholder="-0.10"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="档位缺口容差 limitEps" style={{ marginBottom: 8 }} help="默认 0.005，[0, 0.005]；过大将侵占阈值判定带">
                        <InputNumber
                          className="!w-full"
                          min={0}
                          max={0.005}
                          step={0.001}
                          value={limitEps}
                          onChange={(v) => setLimitEps(v)}
                          placeholder="0.005"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="佣金率 commissionRate" style={{ marginBottom: 8 }} help="默认 0.0003，≥0（双向）">
                        <InputNumber
                          className="!w-full"
                          min={0}
                          step={0.0001}
                          value={commissionRate}
                          onChange={(v) => setCommissionRate(v)}
                          placeholder="0.0003"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="最低佣金 minCommission" style={{ marginBottom: 8 }} help="默认 5 元，≥0（双向）">
                        <InputNumber
                          className="!w-full"
                          min={0}
                          step={1}
                          value={minCommission}
                          onChange={(v) => setMinCommission(v)}
                          placeholder="5"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="印花税率 stampTaxRate" style={{ marginBottom: 8 }} help="默认 0.0005，[0, 0.05]（仅卖出）">
                        <InputNumber
                          className="!w-full"
                          min={0}
                          max={0.05}
                          step={0.0005}
                          value={stampTaxRate}
                          onChange={(v) => setStampTaxRate(v)}
                          placeholder="0.0005"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="滑点率 slippageRate" style={{ marginBottom: 8 }} help="默认 0.001，[0, 0.05]；买贵卖便宜">
                        <InputNumber
                          className="!w-full"
                          min={0}
                          max={0.05}
                          step={0.0005}
                          value={slippageRate}
                          onChange={(v) => setSlippageRate(v)}
                          placeholder="0.001"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )
              }
            ]}
          />
        </Form>
      </Card>

      {!result && (
        <Card size="small">
          <div className="py-8 text-center text-sm text-text-sub">
            输入股票代码（如 sh600519）后点击「运行回测」；回测仅消费日线行情库前复权 K 线，
            信号为服务端内置 MA5/MA20 双均线交叉演示，不接受外部信号数组。
          </div>
        </Card>
      )}

      {result && (
        <Card size="small" title="绩效指标">
          <Row gutter={[12, 12]}>
            {metricCards.map((card) => (
              <Col key={card.title} xs={12} sm={8} md={6} lg={4}>
                <Statistic
                  title={card.title}
                  value={card.value}
                  valueStyle={{ fontSize: 18, ...(card.color ? { color: card.color } : {}) }}
                />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 净值/回撤双图：归一化净值主图（基线 y=1）+ 回撤面积副图，双 grid 联动缩放 */}
      {result && chartOption && (
        <Card
          size="small"
          title="净值与回撤"
          extra={<span className="text-xs text-text-sub">净值=权益/初始资金；T 日净值已反映次日开盘成交</span>}
        >
          <ReactECharts option={chartOption} style={{ height: CHART_HEIGHT, width: '100%' }} notMerge lazyUpdate />
        </Card>
      )}

      {result && (
        <Card
          size="small"
          title={`交易明细（成交 ${result.metrics.tradeCount} 笔 · 跳过 ${skippedCount} 笔 · 已平仓 ${result.metrics.roundTripCount} 回合）`}
        >
          <SelfTable
            rowKey={(row: TradeRecord) => `${row.signalDate}:${row.signalAction}:${row.tradeDate ?? 'na'}`}
            size="small"
            columns={tradeColumns}
            dataSource={result.trades}
            // 条件分页特例：不传 showSizeChanger（SelfTable 默认 true 与 rc-pagination total>50 默认一致），
            // pageSizeOptions 显式对齐 rc-pagination 原生默认（components/README.md）
            pagination={
              result.trades.length > 50
                ? { pageSize: 50, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (t) => `共 ${t} 条` }
                : false
            }
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: '无交易记录（信号未产生成交或全部被跳过）' }}
          />
        </Card>
      )}
    </div>
  );
};
