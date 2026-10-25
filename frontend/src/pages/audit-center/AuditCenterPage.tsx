// 审计中心页面提供审计日志与前端日志查询。
import React, { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tabs, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { listAuditLogs, getAuditLogDetail } from '../../api/auditCenter';
import { listLogCenter, getLogCenterDetail, LogEventType } from '../../api/logCenter';
import { batchDicts } from '../../api/dict';
import { AppTable } from '../../components/AppTable';

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

  const showDetail = async (item: AuditItem) => {
    setDetailLoading(true);
    try {
      const res =
        activeTab === 'audit'
          ? await getAuditLogDetail(item.id)
          : await getLogCenterDetail(activeTab, item.id);
      setDetail(res);
    } catch {
      message.error('日志详情加载失败');
    } finally {
      setDetailLoading(false);
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

  const copyTraceId = async (traceId?: string) => {
    if (!traceId) {
      return;
    }
    try {
      await navigator.clipboard.writeText(traceId);
      message.success('TraceId 已复制');
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  const actionColumn: ColumnsType<AuditItem> = [
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record) => (
        <Button size="small" onClick={() => showDetail(record)}>
          详情
        </Button>
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

  const detailRows = (item: AuditItem) => {
    if (activeTab === 'audit') {
      return (
        <>
          <p>用户: {item.userId ?? '-'}</p>
          <p>模块: {item.module ?? '-'}</p>
          <p>动作: {item.action ?? '-'}</p>
          <p>IP: {item.ip ?? '-'}</p>
          <p>时间: {formatTime(item.createdAt)}</p>
          <p>详情: {item.detail ?? '-'}</p>
        </>
      );
    }
    return (
      <>
        <p>用户: {item.userId ?? '-'}</p>
        <p>
          TraceId: {item.traceId ?? '-'}
          {item.traceId && (
            <Button type="link" size="small" onClick={() => copyTraceId(item.traceId)}>
              复制
            </Button>
          )}
        </p>
        <p>SessionId: {item.sessionId ?? '-'}</p>
        <p>来源: {formatSource(item.source)}</p>
        <p>时间: {formatTime(item.createdAt)}</p>
        {'pageCode' in item && <p>页面码: {item.pageCode}</p>}
        {'path' in item && <p>路径: {item.path}</p>}
        {'level' in item && <p>级别: {item.level}</p>}
        {'category' in item && <p>分类: {item.category}</p>}
        {'message' in item && <p>消息: {item.message}</p>}
        {Boolean(item.stack) && (
          <div>
            堆栈:
            <pre className="log-detail-pre">{item.stack}</pre>
          </div>
        )}
        {item.meta && (
          <div>
            元数据:
            <pre className="log-detail-pre">{JSON.stringify(item.meta, null, 2)}</pre>
          </div>
        )}
      </>
    );
  };

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
            <Form.Item label="关键字" name="keyword">
              <Input placeholder="消息关键字" maxLength={200} />
            </Form.Item>
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
          detail && <div>{detailRows(detail)}</div>
        )}
      </Modal>
    </div>
  );
};
