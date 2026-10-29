// 审计中心页面提供审计日志与前端日志查询、traceId 链路聚合展示。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message
} from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { listAuditLogs, getAuditLogDetail } from '../../api/auditCenter';
import { listLogCenter, getLogCenterDetail, getLogTrace, LogEventType, TraceResult } from '../../api/logCenter';
import { batchDicts } from '../../api/dict';
import { AppTable } from '../../components/AppTable';
import { JsonView } from '../../components/JsonView';

interface AuditItem {
  id: number;
  userId?: number;
  module?: string;
  action?: string;
  detail?: string;
  ip?: string;
  createdAt: string;
  traceId?: string;
  sessionId?: string;
  source?: string;
  pageCode?: string;
  path?: string;
  level?: string;
  category?: string;
  message?: string;
  stack?: string;
  meta?: Record<string, unknown>;
  userAgent?: string;
  referrer?: string;
}

type TabKey = 'audit' | LogEventType;

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: 'audit', label: '审计日志' },
  { key: 'track', label: '打点日志' },
  { key: 'frontend', label: '前端日志' },
  { key: 'error', label: '错误日志' }
];

const LEVEL_OPTIONS = ['debug', 'info', 'warn', 'error'].map((value) => ({ value, label: value }));

const LEVEL_COLOR: Record<string, string> = {
  debug: 'default',
  info: 'blue',
  warn: 'orange',
  error: 'red'
};

// 字典接口异常时的来源筛选兜底项（与服务端 seed 的 source_type 字典保持一致）
const SOURCE_FALLBACK_OPTIONS = [
  { value: 'web', label: 'Web' },
  { value: 'server', label: '服务端' }
];

// 文本字段若本身就是 JSON（审计 detail 等自由文本），解析后走 JSON 视图展示
const parseMaybeJson = (text?: string): unknown | undefined => {
  if (!text) {
    return undefined;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

export const AuditCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const routeType = params.type as TabKey | undefined;
  const defaultTab = TAB_ITEMS.some((tab) => tab.key === routeType) ? (routeType as TabKey) : 'audit';
  const [data, setData] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState<AuditItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [sourceLabelMap, setSourceLabelMap] = useState<Record<string, string>>({});
  const [retentionDays, setRetentionDays] = useState(7);
  const [traceState, setTraceState] = useState<{
    open: boolean;
    traceId: string;
    loading: boolean;
    data?: TraceResult;
  }>({ open: false, traceId: '', loading: false });
  // 同一查询条件只提示一次"范围被收敛"，翻页不重复弹
  const lastClampWarnRef = useRef('');
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = { page, pageSize, ...filters };
      const res =
        activeTab === 'audit'
          ? await listAuditLogs(queryParams)
          : await listLogCenter({ type: activeTab, ...queryParams });
      setData(res.items ?? []);
      setTotal(res.total ?? 0);
      if (activeTab !== 'audit') {
        setRetentionDays(res.retentionDays ?? 7);
        const clampKey = `${activeTab}:${filters.start ?? ''}`;
        if (res.clamped && lastClampWarnRef.current !== clampKey) {
          lastClampWarnRef.current = clampKey;
          message.warning(`日志仅保留最近 ${res.retentionDays ?? 7} 天，查询范围已按保留窗口收敛`);
        }
      }
    } catch {
      message.error('日志查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, activeTab, filters]);

  useEffect(() => {
    batchDicts({ codes: 'source_type' })
      .then((res) => {
        const list = (res?.source_type ?? []) as Array<{ value: string; label: string }>;
        const map: Record<string, string> = {};
        list.forEach((item) => {
          map[item.value] = item.label;
        });
        setSourceLabelMap(map);
      })
      .catch(() => {
        setSourceLabelMap({});
      });
  }, []);

  // 路由变化时切换 Tab 并重置查询条件
  useEffect(() => {
    setActiveTab(defaultTab);
    setPage(1);
    setFilters({});
    form.resetFields();
  }, [defaultTab, form]);

  const onSearch = async () => {
    const values = await form.validateFields();
    const range = values.range;
    setPage(1);
    setFilters({
      userId: values.userId,
      traceId: values.traceId,
      sessionId: values.sessionId,
      source: values.source,
      module: values.module,
      action: values.action,
      pageCode: values.pageCode,
      level: values.level,
      keyword: values.keyword,
      start: range ? range[0].toISOString() : undefined,
      end: range ? range[1].toISOString() : undefined
    });
  };

  const onReset = () => {
    form.resetFields();
    setPage(1);
    setFilters({});
  };

  const showDetail = async (type: TabKey, item: AuditItem) => {
    setDetailLoading(true);
    try {
      const res =
        type === 'audit' ? await getAuditLogDetail(item.id) : await getLogCenterDetail(type, item.id);
      setDetail(res);
    } catch {
      message.error('日志详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const openTrace = async (traceId: string) => {
    setTraceState({ open: true, traceId, loading: true });
    try {
      const res = await getLogTrace(traceId);
      setTraceState({ open: true, traceId, loading: false, data: res });
    } catch {
      message.error('链路查询失败，请稍后重试');
      setTraceState((state) => ({ ...state, loading: false }));
    }
  };

  const copyToClipboard = async (text: string, tip = '已复制') => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(tip);
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  const formatTime = (value?: string) => {
    if (!value) {
      return '-';
    }
    return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
  };

  const formatSource = (value?: string) => {
    if (!value) {
      return '-';
    }
    return sourceLabelMap[value] ?? value;
  };

  // 字段行：值 + 可选复制按钮，详情弹窗与链路抽屉共用
  const FieldRow: React.FC<{ label: string; copyText?: string; children: React.ReactNode }> = ({
    label,
    copyText,
    children
  }) => (
    <p style={{ wordBreak: 'break-all' }}>
      {label}: {children}
      {copyText && (
        <Button type="link" size="small" onClick={() => copyToClipboard(copyText)}>
          复制
        </Button>
      )}
    </p>
  );

  const sourceOptions = Object.keys(sourceLabelMap).length
    ? Object.entries(sourceLabelMap).map(([value, label]) => ({ value, label }))
    : SOURCE_FALLBACK_OPTIONS;

  const actionColumn: ColumnsType<AuditItem> = [
    {
      title: '操作',
      width: 150,
      render: (_: unknown, record) => (
        <Space size={0}>
          {activeTab !== 'audit' && record.traceId && (
            <Button type="link" size="small" className="!px-1" onClick={() => openTrace(record.traceId!)}>
              链路
            </Button>
          )}
          <Button type="link" size="small" className="!px-1" onClick={() => showDetail(activeTab, record)}>
            详情
          </Button>
        </Space>
      )
    }
  ];

  const timeColumn: ColumnsType<AuditItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 200,
      render: (value) => formatTime(value as string)
    }
  ];

  const sourceColumn: ColumnsType<AuditItem> = [
    {
      title: '来源',
      dataIndex: 'source',
      width: 120,
      render: (value) => formatSource(value as string)
    }
  ];

  const columns: ColumnsType<AuditItem> = useMemo(() => {
    const baseColumns: ColumnsType<AuditItem> = [
      { title: 'ID', dataIndex: 'id', width: 80 },
      { title: '用户', dataIndex: 'userId', width: 100, render: (value) => value ?? '-' }
    ];
    if (activeTab === 'audit') {
      return [
        ...baseColumns,
        { title: '模块', dataIndex: 'module', width: 140 },
        { title: '动作', dataIndex: 'action', width: 160 },
        { title: 'IP', dataIndex: 'ip', width: 140 },
        ...timeColumn,
        ...actionColumn
      ];
    }
    if (activeTab === 'track') {
      return [
        ...baseColumns,
        { title: '页面码', dataIndex: 'pageCode', width: 160 },
        { title: '路径', dataIndex: 'path', width: 200 },
        { title: 'TraceId', dataIndex: 'traceId', width: 200, ellipsis: true },
        { title: 'Session', dataIndex: 'sessionId', width: 200, ellipsis: true },
        ...sourceColumn,
        ...timeColumn,
        ...actionColumn
      ];
    }
    if (activeTab === 'frontend') {
      return [
        ...baseColumns,
        {
          title: '级别',
          dataIndex: 'level',
          width: 100,
          render: (value) => <Tag color={LEVEL_COLOR[value as string] ?? 'default'}>{(value as string) ?? '-'}</Tag>
        },
        { title: '分类', dataIndex: 'category', width: 120, render: (value) => value ?? '-' },
        { title: '消息', dataIndex: 'message', width: 260, ellipsis: true },
        { title: 'TraceId', dataIndex: 'traceId', width: 200, ellipsis: true },
        { title: 'Session', dataIndex: 'sessionId', width: 200, ellipsis: true },
        ...sourceColumn,
        ...timeColumn,
        ...actionColumn
      ];
    }
    return [
      ...baseColumns,
      { title: '消息', dataIndex: 'message', width: 260, ellipsis: true },
      { title: 'TraceId', dataIndex: 'traceId', width: 200, ellipsis: true },
      { title: 'Session', dataIndex: 'sessionId', width: 200, ellipsis: true },
      ...sourceColumn,
      ...timeColumn,
      ...actionColumn
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sourceLabelMap]);

  const detailRows = (type: TabKey, item: AuditItem) => {
    if (type === 'audit') {
      const detailJson = parseMaybeJson(item.detail);
      return (
        <>
          <FieldRow label="用户" copyText={item.userId != null ? String(item.userId) : undefined}>
            {item.userId ?? '-'}
          </FieldRow>
          <FieldRow label="模块">{item.module ?? '-'}</FieldRow>
          <FieldRow label="动作">{item.action ?? '-'}</FieldRow>
          <FieldRow label="IP" copyText={item.ip}>
            {item.ip ?? '-'}
          </FieldRow>
          <FieldRow label="时间">{formatTime(item.createdAt)}</FieldRow>
          {detailJson !== undefined ? (
            <div>
              详情（JSON）:
              <JsonView value={detailJson} />
            </div>
          ) : (
            <FieldRow label="详情">{item.detail ?? '-'}</FieldRow>
          )}
        </>
      );
    }
    return (
      <>
        <FieldRow label="用户" copyText={item.userId != null ? String(item.userId) : undefined}>
          {item.userId ?? '-'}
        </FieldRow>
        <FieldRow label="TraceId" copyText={item.traceId}>
          {item.traceId ?? '-'}
        </FieldRow>
        <FieldRow label="SessionId" copyText={item.sessionId}>
          {item.sessionId ?? '-'}
        </FieldRow>
        <FieldRow label="来源">{formatSource(item.source)}</FieldRow>
        <FieldRow label="时间">{formatTime(item.createdAt)}</FieldRow>
        {'pageCode' in item && <FieldRow label="页面码">{item.pageCode ?? '-'}</FieldRow>}
        {'path' in item && (
          <FieldRow label="路径" copyText={item.path}>
            {item.path ?? '-'}
          </FieldRow>
        )}
        {'userAgent' in item && <FieldRow label="UserAgent">{item.userAgent ?? '-'}</FieldRow>}
        {'referrer' in item && <FieldRow label="Referrer">{item.referrer ?? '-'}</FieldRow>}
        {'level' in item && <FieldRow label="级别">{item.level ?? '-'}</FieldRow>}
        {'category' in item && <FieldRow label="分类">{item.category ?? '-'}</FieldRow>}
        {'message' in item && (
          <FieldRow label="消息" copyText={item.message}>
            {item.message ?? '-'}
          </FieldRow>
        )}
        {Boolean(item.stack) && (
          <div>
            堆栈:
            <pre className="log-detail-pre">{item.stack}</pre>
          </div>
        )}
        {item.meta && (
          <div>
            元数据（JSON）:
            <JsonView value={item.meta} />
          </div>
        )}
      </>
    );
  };

  // 链路时间线：三类日志按时间正序合并，颜色区分类型/级别
  const traceTimelineItems = useMemo(() => {
    const trace = traceState.data;
    if (!trace) {
      return [];
    }
    const entries: Array<{ type: LogEventType; item: AuditItem }> = [
      ...trace.track.map((raw) => ({ type: 'track' as const, item: raw as unknown as AuditItem })),
      ...trace.frontend.map((raw) => ({ type: 'frontend' as const, item: raw as unknown as AuditItem })),
      ...trace.error.map((raw) => ({ type: 'error' as const, item: raw as unknown as AuditItem }))
    ];
    entries.sort(
      (a, b) => new Date(a.item.createdAt).getTime() - new Date(b.item.createdAt).getTime()
    );
    return entries.map(({ type, item }) => {
      const color =
        type === 'error'
          ? 'red'
          : type === 'track'
            ? 'green'
            : LEVEL_COLOR[item.level ?? 'info'] === 'default'
              ? 'gray'
              : LEVEL_COLOR[item.level ?? 'info'] === 'orange'
                ? 'orange'
                : 'blue';
      const typeLabel =
        type === 'error' ? '错误' : type === 'track' ? '打点' : (item.level ?? '前端');
      const summary =
        type === 'track' ? `${item.pageCode ?? ''} ${item.path ?? ''}`.trim() : (item.message ?? '');
      return {
        color,
        children: (
          <div>
            <Space size={8} wrap>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatTime(item.createdAt)}
              </Typography.Text>
              <Tag color={type === 'frontend' ? LEVEL_COLOR[item.level ?? 'info'] : type === 'error' ? 'red' : 'green'}>
                {typeLabel}
              </Tag>
              <Tag>{formatSource(item.source)}</Tag>
              <Button type="link" size="small" className="!px-0" onClick={() => showDetail(type, item)}>
                详情
              </Button>
            </Space>
            <div style={{ fontSize: 13, wordBreak: 'break-all' }}>{summary || '-'}</div>
          </div>
        )
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceState.data, sourceLabelMap]);

  const traceEventCount = traceState.data
    ? traceState.data.track.length + traceState.data.frontend.length + traceState.data.error.length
    : 0;

  return (
    <div className="app-page-flat">
      <div className="page-filter-card">
        <Form layout="inline" form={form} className="flex flex-wrap gap-4">
          <Form.Item label="用户ID" name="userId">
            <InputNumber placeholder="用户ID" min={1} precision={0} style={{ width: 140 }} />
          </Form.Item>
          {activeTab === 'audit' && (
            <>
              <Form.Item label="模块" name="module">
                <Input placeholder="模块" maxLength={64} />
              </Form.Item>
              <Form.Item label="动作" name="action">
                <Input placeholder="动作" maxLength={64} />
              </Form.Item>
            </>
          )}
          {activeTab === 'track' && (
            <Form.Item label="页面码" name="pageCode">
              <Input placeholder="页面码" maxLength={128} />
            </Form.Item>
          )}
          {activeTab === 'frontend' && (
            <Form.Item label="级别" name="level">
              <Select placeholder="级别" allowClear options={LEVEL_OPTIONS} style={{ width: 120 }} />
            </Form.Item>
          )}
          {activeTab !== 'audit' && (
            <>
              <Form.Item label="TraceId" name="traceId">
                <Input placeholder="TraceId" maxLength={128} />
              </Form.Item>
              <Form.Item label="SessionId" name="sessionId">
                <Input placeholder="SessionId" maxLength={128} />
              </Form.Item>
            </>
          )}
          {(activeTab === 'frontend' || activeTab === 'error') && (
            <>
              <Form.Item label="来源" name="source">
                <Select placeholder="来源" allowClear options={sourceOptions} style={{ width: 120 }} />
              </Form.Item>
              <Form.Item label="关键字" name="keyword">
                <Input placeholder="消息关键字" maxLength={200} />
              </Form.Item>
            </>
          )}
          <Form.Item label="时间范围" name="range">
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Form.Item className="w-full !mb-0 text-center">
            <Space>
              <Button type="primary" onClick={onSearch}>
                查询
              </Button>
              <Button onClick={onReset}>重置</Button>
              <Button onClick={fetchData}>刷新</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      <div className="page-table-card">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => navigate(`/logs/${key}`)}
          items={TAB_ITEMS}
          style={{ marginBottom: 8 }}
          tabBarExtraContent={
            activeTab !== 'audit' ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                日志仅保留最近 {retentionDays} 天
              </Typography.Text>
            ) : undefined
          }
        />
        <AppTable
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            }
          }}
        />
      </div>

      <Modal
        className="app-form-modal"
        title="日志详情"
        open={!!detail || detailLoading}
        onCancel={() => setDetail(null)}
        footer={null}
        confirmLoading={detailLoading}
      >
        {detailLoading && !detail ? (
          <p>加载中…</p>
        ) : (
          detail && (
            <div>
              <Space style={{ marginBottom: 8 }}>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(JSON.stringify(detail, null, 2), '已复制整条 JSON')}
                >
                  复制整条 JSON
                </Button>
                {detail.traceId && (
                  <Button size="small" onClick={() => openTrace(detail.traceId!)}>
                    查看链路
                  </Button>
                )}
              </Space>
              {detailRows(activeTab, detail)}
            </div>
          )
        )}
      </Modal>

      <Drawer
        width={560}
        open={traceState.open}
        onClose={() => setTraceState((state) => ({ ...state, open: false }))}
        title={
          <Space size={4} wrap>
            链路
            <Typography.Text copyable={{ text: traceState.traceId }} style={{ fontSize: 14 }}>
              {traceState.traceId}
            </Typography.Text>
          </Space>
        }
      >
        {traceState.loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : traceEventCount > 0 ? (
          <Timeline items={traceTimelineItems} />
        ) : (
          <Empty description="该 TraceId 暂无日志" />
        )}
      </Drawer>
    </div>
  );
};
