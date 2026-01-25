// 日志中心页面提供审计日志与前端日志查询。
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, Modal, Space } from 'antd';
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

export const AuditCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const routeType = params.type as LogEventType | 'audit' | undefined;
  const validTypes: Array<'audit' | LogEventType> = ['audit', 'track', 'frontend', 'error'];
  const defaultTab =
    routeType && validTypes.includes(routeType as 'audit' | LogEventType) ? routeType : 'audit';
  const [data, setData] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState<AuditItem | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<'audit' | LogEventType>(defaultTab);
  const [sourceLabelMap, setSourceLabelMap] = useState<Record<string, string>>({});
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize, ...filters };
      const res =
        activeTab === 'audit'
          ? await listAuditLogs(params)
          : await listLogCenter({ type: activeTab, ...params });
      setData(res.items ?? []);
      setTotal(res.total ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, activeTab, filters]);

  useEffect(() => {
    batchDicts({ codes: 'source_type' })
      .then((data) => {
        const list = (data?.source_type ?? []) as Array<{ value: string; label: string }>;
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

  useEffect(() => {
    setActiveTab(defaultTab);
    setPage(1);
    setFilters({});
    form.resetFields();
  }, [defaultTab, form]);

  useEffect(() => {
    if (routeType && !validTypes.includes(routeType as 'audit' | LogEventType)) {
      navigate('/logs/audit', { replace: true });
    }
  }, [routeType, navigate, validTypes]);

  const onSearch = async () => {
    const values = await form.validateFields();
    const range = values.range;
    setPage(1);
    setFilters({
      userId: values.userId,
      traceId: values.traceId,
      sessionId: values.sessionId,
      module: values.module,
      pageCode: values.pageCode,
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
    const res =
      activeTab === 'audit'
        ? await getAuditLogDetail(item.id)
        : await getLogCenterDetail(activeTab, item.id);
    setDetail(res);
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

  const columns: ColumnsType<AuditItem> = useMemo(() => {
    const baseColumns: ColumnsType<AuditItem> = [
      { title: 'ID', dataIndex: 'id', width: 80 },
      { title: '用户', dataIndex: 'userId', width: 100 }
    ];
    if (activeTab === 'audit') {
      return [
        ...baseColumns,
        { title: '模块', dataIndex: 'module', width: 140 },
        { title: '动作', dataIndex: 'action', width: 160 },
        { title: 'IP', dataIndex: 'ip', width: 140 },
        {
          title: '时间',
          dataIndex: 'createdAt',
          width: 200,
          render: (value) => formatTime(value as string)
        },
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
    }
    if (activeTab === 'track') {
      return [
        ...baseColumns,
        { title: '页面码', dataIndex: 'pageCode', width: 160 },
        { title: '路径', dataIndex: 'path', width: 200 },
        { title: 'TraceId', dataIndex: 'traceId', width: 200 },
        { title: 'Session', dataIndex: 'sessionId', width: 200 },
        { title: '来源', dataIndex: 'source', width: 120, render: (value) => formatSource(value as string) },
        {
          title: '时间',
          dataIndex: 'createdAt',
          width: 200,
          render: (value) => formatTime(value as string)
        },
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
    }
    if (activeTab === 'frontend') {
      return [
        ...baseColumns,
        { title: '级别', dataIndex: 'level', width: 100 },
        { title: '分类', dataIndex: 'category', width: 120 },
        { title: '消息', dataIndex: 'message', width: 260 },
        { title: 'TraceId', dataIndex: 'traceId', width: 200 },
        { title: 'Session', dataIndex: 'sessionId', width: 200 },
        { title: '来源', dataIndex: 'source', width: 120, render: (value) => formatSource(value as string) },
        {
          title: '时间',
          dataIndex: 'createdAt',
          width: 200,
          render: (value) => formatTime(value as string)
        },
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
    }
    return [
      ...baseColumns,
      { title: '消息', dataIndex: 'message', width: 260 },
      { title: 'TraceId', dataIndex: 'traceId', width: 200 },
      { title: 'Session', dataIndex: 'sessionId', width: 200 },
      { title: '来源', dataIndex: 'source', width: 120, render: (value) => formatSource(value as string) },
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 200,
        render: (value) => formatTime(value as string)
      },
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
  }, [activeTab]);

  return (
    <Card>
      <Form
        layout="inline"
        form={form}
        style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}
      >
        <Form.Item label="用户ID" name="userId">
          <Input placeholder="用户ID" />
        </Form.Item>
        {activeTab === 'audit' && (
          <Form.Item label="模块" name="module">
            <Input placeholder="模块" />
          </Form.Item>
        )}
        {activeTab === 'track' && (
          <Form.Item label="页面码" name="pageCode">
            <Input placeholder="页面码" />
          </Form.Item>
        )}
        {activeTab !== 'audit' && (
          <Form.Item label="TraceId" name="traceId">
            <Input placeholder="TraceId" />
          </Form.Item>
        )}
        {activeTab !== 'audit' && (
          <Form.Item label="SessionId" name="sessionId">
            <Input placeholder="SessionId" />
          </Form.Item>
        )}
        {(activeTab === 'frontend' || activeTab === 'error') && (
          <Form.Item label="关键字" name="keyword">
            <Input placeholder="关键字" />
          </Form.Item>
        )}
        <Form.Item label="时间范围" name="range">
          <DatePicker.RangePicker showTime />
        </Form.Item>
        <Form.Item style={{ width: '100%', marginBottom: 0, textAlign: 'center' }}>
          <Space>
            <Button type="primary" onClick={onSearch}>
              查询
            </Button>
            <Button onClick={onReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>

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

      <Modal
        title="日志详情"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
      >
        {detail && (
          <div>
            {activeTab === 'audit' && (
              <>
                <p>用户: {detail.userId}</p>
                <p>模块: {detail.module}</p>
                <p>动作: {detail.action}</p>
                <p>IP: {detail.ip}</p>
                <p>时间: {formatTime(detail.createdAt)}</p>
                <p>详情: {detail.detail}</p>
              </>
            )}
            {activeTab !== 'audit' && (
              <>
                <p>用户: {detail.userId}</p>
                <p>TraceId: {detail.traceId}</p>
                <p>SessionId: {detail.sessionId}</p>
                <p>来源: {formatSource(detail.source)}</p>
                <p>时间: {formatTime(detail.createdAt)}</p>
                {'pageCode' in detail && <p>页面码: {detail.pageCode}</p>}
                {'path' in detail && <p>路径: {detail.path}</p>}
                {'level' in detail && <p>级别: {detail.level}</p>}
                {'category' in detail && <p>分类: {detail.category}</p>}
                {'message' in detail && <p>消息: {detail.message}</p>}
                {'stack' in detail && <p>堆栈: {detail.stack}</p>}
                {'meta' in detail && (
                  <p>
                    元数据:
                    <pre>{JSON.stringify(detail.meta, null, 2)}</pre>
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
};
