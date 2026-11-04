// 策略模拟盘管理页（路由 /stock/strategy；权限码 stock:strategy:manage，菜单可见性由后端
// resources 表驱动，前端零菜单代码）。结构：
// ①策略列表 SelfTable（名称/模板 Tag/启用 Switch/账户摘要/最近信号/操作列）→
// ②新建/编辑 Modal（模板 Select 切换即按 PARAM_FIELDS 重建参数表单）→
// ③④详情 Drawer（账户摘要 + 信号/持仓 Tabs，信号行内「加入自选」）→
// ⑤运行（runStrategy 后刷新+msg，失败由 accounts.last_run_error 承载）→
// ⑥回测 → StrategyBacktestDrawer →
// ⑦圆桌点评：页面内嵌 useRoundtableFlow（StockPage.tsx:64 同款用法），点评=flow.start(
//   {subjectType:'strategy', strategyId, question}, 策略名作 displayName)，start 自带
//   createRoundtable+attach SSE；session 用既有 RoundtableStage 渲染弹 Drawer 不新写舞台；
//   注意 /stock?meeting= 深链不存在，禁止 navigate 跳参方案；已完成会议用 restore 静态回放，
//   历史会议也可从圆桌页 HistoryTable 查。会议流关闭=flow.stop()。
// 管理端接口全部挂 stock:strategy:manage（后端 @Permissions），无权限整页降级提示；
// 圆桌点评另需 stock:roundtable:use（照 StockPage.tsx:177 Permission 包裹惯例）。
import React, { useEffect, useMemo, useState } from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Collapse from 'antd/es/collapse';
import DatePicker from 'antd/es/date-picker';
import Drawer from 'antd/es/drawer';
import Form from 'antd/es/form';
import { Col, Row } from 'antd/es/grid';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Segmented from 'antd/es/segmented';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import Tabs from 'antd/es/tabs';
import Tag from 'antd/es/tag';
import Tooltip from 'antd/es/tooltip';
import type { ColumnsType } from 'antd/es/table';
import {
  LineChartOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  TeamOutlined
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { Permission } from '../../components/permission/Permission';
import { SelfForm, validateFormValues } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfTable } from '../../components/base/SelfTable';
import { ConfirmPopconfirm } from '../../components/business/ConfirmAction';
import { PageHeader } from '../../components/business/PageHeader';
import { useAppSelector } from '../../store/hooks';
import { useApiMessage } from '../../hooks/useApiMessage';
import { addToWatchlist } from '../../api/watchlist';
import type { PositionModelType, RunBacktestPositionModelPayload } from '../../api/backtest';
import {
  createStrategy,
  deleteStrategy,
  getStrategy,
  listStrategies,
  runStrategy,
  updateStrategy,
  type CreateStrategyPayload,
  type StrategyConfigItem,
  type StrategyDetail,
  type StrategyPositionItem,
  type StrategySignalItem,
  type StrategyTemplate
} from '../../api/strategy';
import { RoundtableStage } from './components/RoundtableStage';
import { StrategyBacktestDrawer } from './components/StrategyBacktestDrawer';
import { useRoundtableFlow } from './useRoundtableFlow';
import { ACTION_LABELS, SYMBOL_PATTERN, fmtMoney, fmtNum } from './backtestUI';
import {
  PARAM_FIELDS,
  POSITION_STATUS_TAG,
  SIGNAL_STATUS_TAG,
  TEMPLATE_OPTIONS,
  buildStrategyBriefSummary,
  defaultParamsOf,
  fmtCash,
  fmtShares,
  isRotationTemplate,
  strategySkipReasonTagMeta,
  templateLabel,
  validateTemplateParams
} from './strategyUI';
import './stock.css';

// 仓位模型 Segmented 选项（BacktestPanel.tsx:71-75 MODEL_OPTIONS 同款语义：全仓/固定比例/ATR 敞口）
const MODEL_OPTIONS: Array<{ label: string; value: PositionModelType }> = [
  { label: '全仓', value: 'all-in' },
  { label: '固定比例', value: 'fixed-ratio' },
  { label: 'ATR 风险敞口', value: 'atr' }
];

// 把粘贴文本拆成代码数组：支持逗号/空格/换行/分号分隔（ScreenerPage.tsx:44-49 同款解析）
const parseSymbols = (text: string): string[] =>
  text
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

interface FormValues {
  name: string;
  template: StrategyTemplate;
  params: Record<string, number | null>;
  symbolsText: string;
  initialCash: number | null;
  simStartDate: Dayjs | null;
  remark?: string;
  posType: PositionModelType;
  posRatio?: number | null;
  posRiskPct?: number | null;
  posMaxPct?: number | null;
  posAtrPeriod?: number | null;
}

const buildPositionModel = (values: FormValues): RunBacktestPositionModelPayload | undefined => {
  if (values.posType === 'fixed-ratio') {
    return { type: 'fixed-ratio', ratio: values.posRatio ?? undefined };
  }
  if (values.posType === 'atr') {
    return {
      type: 'atr',
      riskPct: values.posRiskPct ?? undefined,
      maxPositionPct: values.posMaxPct ?? undefined,
      atrPeriod: values.posAtrPeriod ?? undefined
    };
  }
  return { type: 'all-in' };
};

export const StrategyPage: React.FC = () => {
  const msg = useApiMessage();
  const permissions = useAppSelector((state) => state.auth.profile?.permissions ?? []);
  const canManage = permissions.includes('stock:strategy:manage');

  // ==================== 列表 ====================
  const [items, setItems] = useState<StrategyConfigItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);
  const [switchId, setSwitchId] = useState<number | null>(null);

  // ==================== 新建/编辑 Modal ====================
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StrategyConfigItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();
  const watchTemplate = Form.useWatch('template', form);
  const template: StrategyTemplate = watchTemplate ?? 'ma-cross';
  const posType = Form.useWatch('posType', form);

  // ==================== 详情 Drawer（信号/持仓 Tabs） ====================
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StrategyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ==================== 回测 Drawer ====================
  const [backtestTarget, setBacktestTarget] = useState<StrategyConfigItem | null>(null);

  // ==================== 圆桌点评（页面内嵌会议流） ====================
  const [rtTarget, setRtTarget] = useState<StrategyConfigItem | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [starting, setStarting] = useState(false);
  const [rtOpen, setRtOpen] = useState(false);
  const { session, start, stop, restore } = useRoundtableFlow();

  const loadList = async (nextPage = page, nextSize = pageSize) => {
    setLoading(true);
    try {
      const res = await listStrategies({ page: nextPage, pageSize: nextSize });
      setItems(Array.isArray(res?.items) ? res.items : []);
      setTotal(res?.total ?? 0);
    } catch (error) {
      msg.errorFrom(error, '策略列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) {
      void loadList(page, pageSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, canManage]);

  const openDetail = async (record: StrategyConfigItem) => {
    setDetailOpen(true);
    setDetailId(record.id);
    setDetail(null);
    await loadDetail(record.id);
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      setDetail(await getStrategy(id));
    } catch (error) {
      msg.errorFrom(error, '策略详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const onToggleEnabled = async (record: StrategyConfigItem, checked: boolean) => {
    setSwitchId(record.id);
    try {
      const res = await updateStrategy(record.id, { enabled: checked });
      if (res.warning) {
        msg.info(res.warning);
      } else {
        msg.success(checked ? '已启用' : '已停用');
      }
      await loadList();
    } catch (error) {
      msg.errorFrom(error, '操作失败');
    } finally {
      setSwitchId(null);
    }
  };

  const onRun = async (record: StrategyConfigItem) => {
    setRunId(record.id);
    try {
      const res = await runStrategy(record.id);
      // 窗口超上限等运行级失败返回 200，由 accounts.last_run_error 承载
      if (res.account?.lastRunStatus === 'failed') {
        msg.error(`运行失败：${res.account.lastRunError ?? '详见账户最近运行错误'}`);
      } else {
        msg.success(`运行完成：信号 ${res.signalsUpserted} 条 · 持仓 ${res.positionsUpdated} 行 · 重放至 ${res.replayedThrough ?? '--'}`);
      }
      await loadList();
      if (detailOpen && detailId === record.id) {
        await loadDetail(record.id);
      }
    } catch (error) {
      msg.errorFrom(error, '运行失败');
    } finally {
      setRunId(null);
    }
  };

  const onDelete = async (record: StrategyConfigItem) => {
    try {
      await deleteStrategy(record.id);
      msg.success('已删除');
      if (detailId === record.id) {
        setDetailOpen(false);
        setDetailId(null);
      }
      if (backtestTarget?.id === record.id) {
        setBacktestTarget(null);
      }
      await loadList();
    } catch (error) {
      msg.errorFrom(error, '删除失败');
    }
  };

  // ==================== 新建/编辑 ====================

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      template: 'ma-cross',
      params: defaultParamsOf('ma-cross'),
      posType: 'all-in',
      initialCash: 100000
    });
    setModalOpen(true);
  };

  const openEdit = (record: StrategyConfigItem) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      template: record.template,
      // params 为后端「?? defaultParams 合并」后的生效参数，缺失键再补模板默认
      params: { ...defaultParamsOf(record.template), ...(record.params ?? {}) },
      symbolsText: (record.symbols ?? []).join(', '),
      initialCash: record.initialCash,
      simStartDate: record.simStartDate ? dayjs(record.simStartDate) : null,
      remark: record.remark ?? '',
      posType: record.positionModel?.type ?? 'all-in',
      posRatio: record.positionModel?.ratio,
      posRiskPct: record.positionModel?.riskPct,
      posMaxPct: record.positionModel?.maxPositionPct,
      posAtrPeriod: record.positionModel?.atrPeriod
    });
    setModalOpen(true);
  };

  const onSave = async () => {
    const values = await validateFormValues(form);
    if (!values) {
      return;
    }
    // 参数区间由 InputNumber min/max 拦单字段，跨字段约束前端同口径前置校验（后端 validateParams 兜底 422）
    const params: Record<string, number> = {};
    for (const field of PARAM_FIELDS[values.template]) {
      const v = values.params?.[field.name];
      if (v != null) {
        params[field.name] = v;
      }
    }
    const constraintError = validateTemplateParams(values.template, params);
    if (constraintError) {
      msg.warning(constraintError);
      return;
    }
    // symbols 解析与校验（与后端契约同口径：正则/数量/去重）
    const symbols = parseSymbols(values.symbolsText).map((item) => item.trim().toLowerCase());
    if (symbols.length === 0) {
      msg.warning('请填入标的代码');
      return;
    }
    const invalid = symbols.find((item) => !SYMBOL_PATTERN.test(item));
    if (invalid) {
      msg.warning(`代码格式非法：${invalid}（须半角小写 ^(sh|sz)\\d{6}$，如 sh600519）`);
      return;
    }
    if (new Set(symbols).size !== symbols.length) {
      msg.warning('标的代码有重复');
      return;
    }
    if (symbols.length > 8) {
      msg.warning('标的最多 8 个');
      return;
    }
    const rotation = isRotationTemplate(values.template);
    if (rotation && symbols.length < 2) {
      msg.warning('轮动模板（ETF 动量）标的须 ≥2 个');
      return;
    }
    if (!rotation && symbols.length !== 1) {
      msg.warning('单标的模板须恰 1 个标的');
      return;
    }
    const payload: CreateStrategyPayload = {
      name: values.name.trim(),
      template: values.template,
      params,
      symbols,
      initialCash: values.initialCash ?? undefined,
      positionModel: buildPositionModel(values),
      simStartDate: values.simStartDate ? values.simStartDate.format('YYYY-MM-DD') : undefined,
      remark: values.remark?.trim() || undefined
    };
    setSaving(true);
    try {
      if (editing) {
        const res = await updateStrategy(editing.id, payload);
        msg.success('已保存');
        // PUT warning：UX 提示「下轮按新口径全量重建投影」（影子账户语义）
        if (res.warning) {
          msg.info(res.warning);
        }
      } else {
        await createStrategy(payload);
        msg.success('已创建');
      }
      setModalOpen(false);
      await loadList();
    } catch (error) {
      msg.errorFrom(error, '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ==================== 信号 Tab：加入自选 ====================

  const onAddToWatchlist = async (symbol: string) => {
    try {
      // 名称以代码占位（自选页以行情快照名称为准）；服务层 add 幂等
      await addToWatchlist({ symbol, name: symbol });
      msg.success(`${symbol.toUpperCase()} 已加入自选`);
    } catch (error) {
      msg.errorFrom(error, '加入自选失败');
    }
  };

  // ==================== 圆桌点评 ====================

  const onRoundtableClick = (record: StrategyConfigItem) => {
    if (session.phase === 'running') {
      msg.warning('已有会议进行中，请先断开当前直播');
      setRtOpen(true);
      return;
    }
    setRtTarget(record);
    setQuestion('');
    setAskOpen(true);
  };

  const confirmStartRoundtable = async () => {
    if (!rtTarget) {
      return;
    }
    setStarting(true);
    // 点评=flow.start：自带 createRoundtable（create 即校验策略存在性）+ attach SSE
    const error = await start(
      { subjectType: 'strategy', strategyId: rtTarget.id, question: question.trim() || undefined },
      rtTarget.name
    );
    setStarting(false);
    if (error) {
      msg.error(`发起会议失败：${error}`);
      return;
    }
    setAskOpen(false);
    setRtOpen(true);
  };

  const closeRoundtable = () => {
    stop(); // 会议流关闭=flow.stop()
    setRtOpen(false);
  };

  const replayCurrent = async () => {
    if (!session.id) {
      return;
    }
    try {
      await restore(session.id); // 已完成会议静态回放
    } catch (error) {
      msg.errorFrom(error, '载入会议记录失败');
    }
  };

  // ==================== 列定义 ====================

  const renderAccountSummary = (record: StrategyConfigItem) => {
    const account = record.account;
    if (!account) {
      return <span className="text-xs text-text-sub">未运行</span>;
    }
    return (
      <Space size={10} wrap>
        <span className="text-xs">现金 {fmtCash(account.cash)}</span>
        <span className="text-xs">净值 {fmtCash(account.equity)}</span>
        <span className="text-xs">市值 {fmtCash(account.marketValue)}</span>
        {account.lastRunStatus === 'failed' && (
          <Tooltip title={account.lastRunError || '最近运行失败'}>
            <Tag color="red">failed</Tag>
          </Tooltip>
        )}
      </Space>
    );
  };

  const columns = useMemo<ColumnsType<StrategyConfigItem>>(
    () => [
      {
        title: '名称',
        dataIndex: 'name',
        width: 170,
        render: (v: string, record) => (
          <Button type="link" size="small" className="!px-0" onClick={() => void openDetail(record)}>
            {v}
          </Button>
        )
      },
      {
        title: '模板',
        dataIndex: 'template',
        width: 120,
        render: (v: StrategyTemplate) => <Tag color="geekblue">{templateLabel(v)}</Tag>
      },
      {
        title: '标的',
        key: 'symbols',
        width: 200,
        ellipsis: true,
        render: (_: unknown, record) => (
          <Tooltip title={(record.symbols ?? []).join(', ')}>
            <span className="font-mono text-xs">{(record.symbols ?? []).join(', ') || '-'}</span>
          </Tooltip>
        )
      },
      {
        title: '启用',
        dataIndex: 'enabled',
        width: 80,
        render: (v: boolean, record) => (
          <Switch
            size="small"
            checked={v}
            loading={switchId === record.id}
            onChange={(checked) => void onToggleEnabled(record, checked)}
          />
        )
      },
      {
        title: '账户摘要（现金 · 净值 · 市值）',
        key: 'account',
        width: 300,
        render: (_: unknown, record) => renderAccountSummary(record)
      },
      {
        title: '最近信号',
        dataIndex: 'latestSignalCount',
        width: 90,
        render: (v?: number) => (v == null ? '-' : `${v} 条`)
      },
      {
        title: '操作',
        key: 'action',
        width: 310,
        fixed: 'right',
        render: (_: unknown, record) => (
          <Space size={0}>
            <Button size="small" type="link" onClick={() => openEdit(record)}>
              编辑
            </Button>
            <Button
              size="small"
              type="link"
              icon={<RocketOutlined />}
              loading={runId === record.id}
              disabled={!record.enabled}
              onClick={() => void onRun(record)}
            >
              运行
            </Button>
            <Button
              size="small"
              type="link"
              icon={<LineChartOutlined />}
              onClick={() => setBacktestTarget(record)}
            >
              回测
            </Button>
            <Permission code="stock:roundtable:use">
              <Button size="small" type="link" icon={<TeamOutlined />} onClick={() => onRoundtableClick(record)}>
                圆桌点评
              </Button>
            </Permission>
            <ConfirmPopconfirm
              title="确认删除该策略？"
              okText="删除"
              onConfirm={() => void onDelete(record)}
            >
              <Button size="small" type="link" danger>
                删除
              </Button>
            </ConfirmPopconfirm>
          </Space>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runId, switchId, detailId, detailOpen, backtestTarget, session.phase]
  );

  // ==================== 详情 Drawer 列定义 ====================

  const signalColumns = useMemo<ColumnsType<StrategySignalItem>>(
    () => [
      { title: '日期', dataIndex: 'tradeDate', width: 105 },
      {
        title: '标的',
        dataIndex: 'symbol',
        width: 100,
        render: (v: string) => <span className="font-mono">{v?.toUpperCase?.() ?? v}</span>
      },
      {
        title: '方向',
        dataIndex: 'action',
        width: 70,
        render: (v: StrategySignalItem['action']) => (
          <Tag color={v === 'buy' ? 'red' : 'green'}>{ACTION_LABELS[v]}</Tag>
        )
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 90,
        render: (v: string) => {
          const meta = SIGNAL_STATUS_TAG(v);
          return <Tag color={meta.color}>{meta.text}</Tag>;
        }
      },
      {
        title: '跳过原因',
        dataIndex: 'skipReason',
        width: 140,
        render: (v: string | null) => {
          if (!v) {
            return '-';
          }
          // 码集=内核 SkipReason 九码+组合层 no_bar（无行情/停牌缺日），未知码兜底回显原码
          const meta = strategySkipReasonTagMeta(v);
          return <Tag color={meta.color}>{meta.text}</Tag>;
        }
      },
      { title: '成交价', dataIndex: 'filledPrice', width: 90, render: (v: number | null) => fmtNum(v) },
      { title: '股数', dataIndex: 'shares', width: 85, render: (v: number) => fmtShares(v) },
      { title: '费用', dataIndex: 'fee', width: 90, render: (v: number | null) => fmtMoney(v) },
      {
        title: '操作',
        key: 'watch',
        width: 95,
        render: (_: unknown, record) => (
          <Button size="small" type="link" className="!px-0" onClick={() => void onAddToWatchlist(record.symbol)}>
            加入自选
          </Button>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const positionColumns = useMemo<ColumnsType<StrategyPositionItem>>(
    () => [
      {
        title: '标的',
        dataIndex: 'symbol',
        width: 100,
        render: (v: string) => <span className="font-mono">{v?.toUpperCase?.() ?? v}</span>
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 95,
        render: (v: string) => {
          const meta = POSITION_STATUS_TAG(v);
          return <Tag color={meta.color}>{meta.text}</Tag>;
        }
      },
      { title: '持股', dataIndex: 'shares', width: 90, render: (v: number) => fmtShares(v) },
      { title: '成本', dataIndex: 'avgCost', width: 90, render: (v: number | null) => fmtNum(v) },
      { title: '现价', dataIndex: 'lastPrice', width: 90, render: (v: number | null) => fmtNum(v) },
      { title: '市值', dataIndex: 'marketValue', width: 110, render: (v: number | null) => fmtCash(v) },
      {
        title: '浮动盈亏',
        dataIndex: 'unrealizedPnl',
        width: 110,
        render: (v: number | null) => (
          <span style={v != null && v !== 0 ? { color: v > 0 ? 'var(--color-stock-up)' : 'var(--color-stock-down)' } : undefined}>
            {fmtCash(v)}
          </span>
        )
      },
      { title: '最近买入', dataIndex: 'lastBuyDate', width: 105, render: (v: string | null) => v ?? '--' },
      { title: '最近盯市', dataIndex: 'lastMarkDate', width: 105, render: (v: string | null) => v ?? '--' }
    ],
    []
  );

  const account = detail?.account ?? null;

  return (
    <div className="page-fill">
      <PageHeader
        className="shrink-0"
        title="策略模拟盘"
        subtitle="四模板策略插件与回测内核同一条撮合路径；盘后重放投影（影子账户语义），支持手动运行、回测报告与圆桌点评。"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadList()}>
              刷新
            </Button>
            <Permission code="stock:strategy:manage">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建策略
              </Button>
            </Permission>
          </Space>
        }
      />

      {!canManage ? (
        <div className="flex-1 min-h-0">
          <Alert
            type="warning"
            showIcon
            message="需要「策略管理」权限"
            description="策略模拟盘为管理端功能，请联系管理员授予 stock:strategy:manage 权限码。"
          />
        </div>
      ) : (
        <div className="page-table-card flex-1 min-h-0 flex flex-col">
          <SelfTable
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={loading}
            fill
            // 服务端分页：current/pageSize/total 受控
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              },
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (t) => `共 ${t} 个策略`
            }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: '暂无策略，点击右上角「新建策略」创建' }}
          />
        </div>
      )}

      {/* ② 新建/编辑 Modal：模板切换即按 PARAM_FIELDS 重建参数表单 */}
      <SelfModal
        title={editing ? `编辑策略：${editing.name}` : '新建策略'}
        open={modalOpen}
        width="md"
        onOk={() => void onSave()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText={editing ? '保存' : '创建'}
      >
        <div className="flex flex-col gap-3">
          <Alert
            type="info"
            showIcon
            message="配置变更（参数/标的池/起点/模板）后，下一轮运行将按新口径全量重建投影（影子账户语义，不做历史冻结）。"
          />
          <SelfForm form={form} initialValues={{ initialCash: 100000, posType: 'all-in' }}>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="name"
                  label="策略名称"
                  rules={[{ required: true, message: '请输入策略名称' }, { max: 64, message: '名称最长 64 字' }]}
                >
                  <Input maxLength={64} placeholder="如：白酒 ETF 动量轮动" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="template" label="模板" rules={[{ required: true, message: '请选择模板' }]}>
                  <Select
                    options={TEMPLATE_OPTIONS}
                    placeholder="选择策略模板"
                    onChange={(value) => {
                      // 切换模板即按 PARAM_FIELDS 重建参数表单（默认值回填）
                      form.setFieldsValue({
                        template: value as StrategyTemplate,
                        params: defaultParamsOf(value as StrategyTemplate)
                      });
                    }}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* 动态参数表单：字段集随模板切换 */}
            <Row gutter={12}>
              {(PARAM_FIELDS[template] ?? []).map((field) => (
                <Col key={field.name} xs={24} md={8}>
                  <Form.Item
                    name={['params', field.name]}
                    label={field.label}
                    help={field.help}
                    rules={[{ required: true, message: `请输入 ${field.label}` }]}
                  >
                    <InputNumber
                      className="!w-full"
                      min={field.min}
                      max={field.max}
                      step={1}
                      placeholder={String(field.default)}
                    />
                  </Form.Item>
                </Col>
              ))}
            </Row>

            <Form.Item
              name="symbolsText"
              label="标的代码"
              help={
                isRotationTemplate(template)
                  ? '轮动模板：2~8 个，逗号/空格/换行分隔；symbols[0] 为基准标的（调仓日历锚）'
                  : '单标的模板：恰 1 个；半角小写 ^(sh|sz)\\d{6}$'
              }
              rules={[{ required: true, message: '请填入标的代码' }]}
            >
              <Input.TextArea
                rows={2}
                placeholder={isRotationTemplate(template) ? 'sh510300, sh512100, sz159915' : 'sh600519'}
              />
            </Form.Item>

            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="初始资金（元）" name="initialCash" rules={[{ required: true, message: '请输入初始资金' }]}>
                  <InputNumber className="!w-full" min={1} step={10000} placeholder="100000" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="重放起点 sim_start_date"
                  name="simStartDate"
                  help="YYYY-MM-DD；修改后调仓相位重置、下轮按新口径全量重建投影"
                >
                  <DatePicker className="!w-full" allowClear />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="备注" name="remark">
              <Input maxLength={255} placeholder="选填，≤255 字" />
            </Form.Item>

            <Collapse
              ghost
              items={[
                {
                  key: 'position-model',
                  label: '仓位模型（可选，默认全仓；与回测内核仓位插件同构）',
                  children: (
                    <>
                      <Form.Item label="仓位模型" style={{ marginBottom: 8 }} help="只决定买入预算；整手取整与费用约束由内核统一处理">
                        <Form.Item name="posType" noStyle>
                          <Segmented options={MODEL_OPTIONS} />
                        </Form.Item>
                      </Form.Item>
                      {posType === 'fixed-ratio' && (
                        <Form.Item
                          name="posRatio"
                          label="固定仓位比例 ratio"
                          help="(0, 1]：买入预算 = min(权益×ratio, 现金)"
                        >
                          <InputNumber className="!w-full" min={0.01} max={1} step={0.05} placeholder="0.5" />
                        </Form.Item>
                      )}
                      {posType === 'atr' && (
                        <Row gutter={12}>
                          <Col xs={24} md={8}>
                            <Form.Item name="posRiskPct" label="单股风险比 riskPct" help="默认 0.01，(0, 0.1]">
                              <InputNumber className="!w-full" min={0.001} max={0.1} step={0.005} placeholder="0.01" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={8}>
                            <Form.Item name="posMaxPct" label="仓位上限 maxPositionPct" help="默认 1，(0, 1]">
                              <InputNumber className="!w-full" min={0.05} max={1} step={0.1} placeholder="1" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={8}>
                            <Form.Item name="posAtrPeriod" label="ATR 周期 atrPeriod" help="默认 14，[2, 60]">
                              <InputNumber className="!w-full" min={2} max={60} step={1} placeholder="14" />
                            </Form.Item>
                          </Col>
                        </Row>
                      )}
                    </>
                  )
                }
              ]}
            />
          </SelfForm>
        </div>
      </SelfModal>

      {/* ③④ 详情 Drawer：账户摘要 + 信号/持仓 Tabs */}
      <Drawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={960}
        title={detail ? `策略详情 · ${detail.config.name}` : '策略详情'}
        destroyOnClose
        extra={
          detailId != null && (
            <Button size="small" icon={<ReloadOutlined />} loading={detailLoading} onClick={() => void loadDetail(detailId)}>
              刷新
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-3">
          {detail && (
            <div className="flex flex-col gap-1">
              <div className="text-xs text-text-sub">{buildStrategyBriefSummary(detail.config)}</div>
              {account ? (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-sub">
                  <span>现金 {fmtCash(account.cash)}</span>
                  <span>净值 {fmtCash(account.equity)}</span>
                  <span>市值 {fmtCash(account.marketValue)}</span>
                  <span>重放至 {account.replayedThrough ?? '--'}</span>
                  {account.lastRunStatus === 'failed' && (
                    <span className="text-red-500">最近运行失败：{account.lastRunError ?? '详见后端日志'}</span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-text-sub">账户尚未运行（点击列表「运行」开始模拟盘重放）</div>
              )}
            </div>
          )}
          <Tabs
            defaultActiveKey="signals"
            items={[
              {
                key: 'signals',
                label: '信号',
                children: (
                  <SelfTable
                    rowKey={(row: StrategySignalItem) => `${row.tradeDate}:${row.symbol}:${row.action}`}
                    size="small"
                    columns={signalColumns}
                    dataSource={detail?.recentSignals ?? []}
                    loading={detailLoading}
                    pagination={
                      (detail?.recentSignals.length ?? 0) > 50
                        ? { pageSize: 50, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (t) => `共 ${t} 条` }
                        : false
                    }
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: '暂无信号（预热段信号行不落库，正式段信号产生后在此展示）' }}
                  />
                )
              },
              {
                key: 'positions',
                label: '持仓',
                children: (
                  <SelfTable
                    rowKey="symbol"
                    size="small"
                    columns={positionColumns}
                    dataSource={detail?.positions ?? []}
                    loading={detailLoading}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: '暂无持仓（影子账户口径：last_buy_date 可早于重放起点，属预热段建仓）' }}
                  />
                )
              }
            ]}
          />
          <div className="text-xs text-text-sub">
            影子账户口径：持仓/账户含预热段经济后果，last_buy_date 可早于重放起点（sim_start_date）；
            正式段起点净值≠初始资金（含预热段盈亏）。日线收盘盯市：T 日信号 T+1 开盘成交。
          </div>
        </div>
      </Drawer>

      {/* ⑥ 回测报告 Drawer（单标的与轮动共用） */}
      <StrategyBacktestDrawer
        open={!!backtestTarget}
        strategyId={backtestTarget?.id ?? null}
        strategyName={backtestTarget?.name ?? ''}
        onClose={() => setBacktestTarget(null)}
      />

      {/* ⑦ 点评提问（可选）→ 圆桌现场 Drawer */}
      <SelfModal
        title={`圆桌点评 · ${rtTarget?.name ?? ''}`}
        open={askOpen}
        onOk={() => void confirmStartRoundtable()}
        onCancel={() => setAskOpen(false)}
        confirmLoading={starting}
        okText="发起点评"
      >
        <div className="flex flex-col gap-2">
          <div className="text-xs text-text-sub">
            五位专家将基于该策略的回测绩效、最新信号与持仓快照展开独立分析与辩论；
            已完成会议可在此回放，历史会议也可从「股市圆桌」页会议记录查看。
          </div>
          <Input.TextArea
            rows={3}
            maxLength={200}
            placeholder="想让专家们重点关注什么？（可选）"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </div>
      </SelfModal>

      <Drawer
        open={rtOpen}
        onClose={closeRoundtable}
        width={1100}
        title={`🏛 ${session.subjectName || rtTarget?.name || ''} · 圆桌点评`}
        destroyOnClose
        extra={
          (session.phase === 'completed' || session.phase === 'failed') && session.id != null ? (
            <Button size="small" onClick={() => void replayCurrent()}>
              重新回放
            </Button>
          ) : undefined
        }
      >
        <RoundtableStage session={session} onStop={stop} />
      </Drawer>
    </div>
  );
};
