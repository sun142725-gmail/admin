// 通知发布页面提供发布弹窗与发送记录查询。
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Tag, Typography, message } from 'antd';
import { AppTable } from '../../components/AppTable';
import { Permission } from '../../components/permission/Permission';
import {
  getNotificationPublishDetail,
  listNotificationPublishes,
  listNotificationTemplates,
  publishNotification,
  retryNotificationPublish
} from '../../api/notification';
import { listUsers } from '../../api/users';

interface TemplateItem {
  id: number;
  name: string;
  channelTypes: string[];
  variables?: Array<{ key: string; label: string; required?: boolean }>;
}

interface PublishItem {
  id: number;
  channelType: string;
  status: string;
  failReason?: string;
  retryCount: number;
  createdAt?: string;
  payload?: {
    recipients?: string[];
    variables?: Record<string, string>;
    title?: string;
  };
  template?: TemplateItem;
}

interface PublishDetail extends PublishItem {
  messages?: Array<{
    id: number;
    title: string;
    content: string;
    status: string;
    userId: number;
    readAt?: string;
    user?: {
      id: number;
      username: string;
      nickname?: string;
    };
  }>;
}

interface QueryValues {
  keyword?: string;
  templateId?: number;
  channelType?: string;
  status?: string;
}

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待发送', value: 'pending' },
  { label: '发送中', value: 'sending' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' }
];

export const PublishPage: React.FC = () => {
  const [data, setData] = useState<PublishItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<PublishDetail | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: number; nickname?: string; username: string }>>([]);
  const [publishForm] = Form.useForm();
  const [queryForm] = Form.useForm();
  const [query, setQuery] = useState<QueryValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const channelType = Form.useWatch('channelType', publishForm);
  const templateId = Form.useWatch('templateId', publishForm);

  const fetchData = async (nextQuery: QueryValues, nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await listNotificationPublishes({
        ...nextQuery,
        templateId: nextQuery.templateId ? Number(nextQuery.templateId) : undefined,
        page: nextPage,
        pageSize: nextPageSize
      });
      setData(res.items ?? []);
      setTotal(res.total ?? 0);
      setPage(nextPage);
      setPageSize(nextPageSize);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    const res = await listNotificationTemplates({ status: 1, pageSize: 200 });
    setTemplates(res.items ?? []);
  };

  const fetchUsers = async () => {
    const res = await listUsers(1, 200);
    setUsers(res.items ?? []);
  };

  useEffect(() => {
    fetchTemplates();
    fetchUsers();
    fetchData({}, 1, pageSize);
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === templateId),
    [templates, templateId]
  );
  const selectedTemplateVariableKeys = useMemo(
    () => new Set((selectedTemplate?.variables ?? []).map((item) => item.key)),
    [selectedTemplate]
  );

  const channelOptions = useMemo(() => {
    const allOptions = [
      { label: '站内信', value: 'inbox' },
      { label: '飞书', value: 'feishu' }
    ];
    if (!selectedTemplate?.channelTypes?.length) {
      return allOptions;
    }
    return allOptions.filter((item) => selectedTemplate.channelTypes.includes(item.value));
  }, [selectedTemplate]);

  useEffect(() => {
    const selectedChannel = publishForm.getFieldValue('channelType');
    if (!selectedTemplate?.channelTypes?.length) {
      return;
    }
    if (!selectedTemplate.channelTypes.includes(selectedChannel)) {
      publishForm.setFieldValue('channelType', selectedTemplate.channelTypes[0]);
    }
  }, [selectedTemplate, publishForm]);

  useEffect(() => {
    const currentValues = publishForm.getFieldValue('variableValues') ?? {};
    const filteredValues = Object.entries(currentValues).reduce((acc, [key, value]) => {
      if (selectedTemplateVariableKeys.has(key)) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);
    publishForm.setFieldValue('variableValues', filteredValues);
  }, [selectedTemplateVariableKeys, publishForm]);

  const onCreate = () => {
    publishForm.resetFields();
    publishForm.setFieldsValue({ channelType: 'inbox', variableValues: {} });
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await publishForm.validateFields();
    let recipients: Array<string | number> = [];
    if (values.channelType === 'inbox') {
      recipients = values.recipients ?? [];
    } else {
      recipients = String(values.feishuRecipients ?? '')
        .split(/[\n,]/)
        .map((item: string) => item.trim())
        .filter(Boolean);
    }
    const variables = Object.entries(values.variableValues ?? {}).reduce((acc, [key, value]) => {
      if (!selectedTemplateVariableKeys.has(key)) {
        return acc;
      }
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>);
    await publishNotification({
      templateId: values.templateId,
      channelType: values.channelType,
      recipients,
      title: values.title,
      variables
    });
    message.success('发布成功');
    setOpen(false);
    fetchData(query, 1, pageSize);
  };

  const onRetry = async (item: PublishItem) => {
    await retryNotificationPublish(item.id);
    message.success('已触发重试');
    fetchData(query, page, pageSize);
  };

  const onViewDetail = async (item: PublishItem) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await getNotificationPublishDetail(item.id);
      setDetail(res);
    } finally {
      setDetailLoading(false);
    }
  };

  const renderContent = (content?: string, variables?: Record<string, string>) => {
    if (!content) {
      return '';
    }
    return content.replace(/{{\s*var\.([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (_match, key) => {
      return variables?.[key] ?? '';
    });
  };

  const renderStatusTag = (value?: string) => {
    const map: Record<string, { color: string; label: string }> = {
      pending: { color: 'default', label: '待发送' },
      sending: { color: 'processing', label: '发送中' },
      success: { color: 'green', label: '成功' },
      failed: { color: 'red', label: '失败' }
    };
    const item = map[value ?? ''] ?? { color: 'default', label: value ?? '-' };
    return <Tag color={item.color}>{item.label}</Tag>;
  };

  const onSearch = async () => {
    const values = queryForm.getFieldsValue();
    const nextQuery: QueryValues = {
      keyword: values.keyword?.trim() || undefined,
      templateId: values.templateId,
      channelType: values.channelType || undefined,
      status: values.status || undefined
    };
    setQuery(nextQuery);
    fetchData(nextQuery, 1, pageSize);
  };

  const onReset = async () => {
    queryForm.resetFields();
    const nextQuery: QueryValues = {};
    setQuery(nextQuery);
    fetchData(nextQuery, 1, pageSize);
  };

  const isVariableRequired = (item: { key: string; required?: boolean }) => {
    if (!item.required) {
      return false;
    }
    if (channelType === 'inbox' && item.key === 'userNickname') {
      return false;
    }
    return true;
  };

  const columns = [
    { title: '模板', dataIndex: ['template', 'name'] },
    {
      title: '通道',
      dataIndex: 'channelType',
      render: (value: string) => (value === 'inbox' ? '站内信' : '飞书')
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string) => renderStatusTag(value)
    },
    { title: '重试次数', dataIndex: 'retryCount' },
    { title: '失败原因', dataIndex: 'failReason' },
    { title: '创建时间', dataIndex: 'createdAt' },
    {
      title: '操作',
      render: (_: unknown, item: PublishItem) => (
        <Space>
          <Button size="small" onClick={() => onViewDetail(item)}>
            查看详情
          </Button>
          <Permission code="system:notification:publish:retry" mode="disable">
            <Button size="small" disabled={item.status !== 'failed'} onClick={() => onRetry(item)}>
              重试
            </Button>
          </Permission>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Form form={queryForm} layout="inline" style={{ marginBottom: 16, rowGap: 12 }}>
        <Form.Item name="templateId" label="模板">
          <Select
            allowClear
            style={{ width: 180 }}
            placeholder="请选择模板"
            options={templates.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Form.Item>
        <Form.Item name="channelType" label="通道">
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="全部通道"
            options={[
              { label: '站内信', value: 'inbox' },
              { label: '飞书', value: 'feishu' }
            ]}
          />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select allowClear style={{ width: 140 }} placeholder="全部状态" options={STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="keyword" label="关键词">
          <Input style={{ width: 220 }} placeholder="模板名/失败原因" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={onSearch}>
              查询
            </Button>
            <Button onClick={onReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>

      <Space style={{ marginBottom: 16 }}>
        <Permission code="system:notification:publish:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            发布通知
          </Button>
        </Permission>
      </Space>

      <AppTable
        rowKey="id"
        columns={columns}
        loading={loading}
        dataSource={data}
        pagination={{
          current: page,
          pageSize,
          total
        }}
        onChange={(pagination) => {
          fetchData(query, pagination.current, pagination.pageSize);
        }}
      />

      <Modal title="发布通知" open={open} onOk={onSubmit} onCancel={() => setOpen(false)} width={720}>
        <Form layout="vertical" form={publishForm}>
          <Form.Item label="选择模板" name="templateId" rules={[{ required: true, message: '请选择模板' }]}>
            <Select
              options={templates.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="请选择模板"
            />
          </Form.Item>
          <Form.Item label="通道" name="channelType" rules={[{ required: true, message: '请选择通道' }]}>
            <Select options={channelOptions} />
          </Form.Item>
          {channelType === 'inbox' ? (
            <Form.Item label="收件人" name="recipients" rules={[{ required: true, message: '请选择收件人' }]}>
              <Select
                mode="multiple"
                options={users.map((user) => ({
                  value: user.id,
                  label: `${user.nickname ?? user.username} (#${user.id})`
                }))}
              />
            </Form.Item>
          ) : (
            <Form.Item label="飞书收件人" name="feishuRecipients">
              <Input.TextArea
                rows={3}
                placeholder="可选，支持多个 webhook 地址（逗号或换行分隔）；留空则使用系统默认地址"
              />
            </Form.Item>
          )}
          <Form.Item label="通知标题" name="title">
            <Input placeholder="默认使用模板名称" />
          </Form.Item>

          {selectedTemplate?.variables?.length ? (
            <>
              <Form.Item label="模板变量" style={{ marginBottom: 0 }}>
                <Space wrap>
                  {selectedTemplate.variables.map((item) => (
                    <Tag key={item.key} color={item.required ? 'red' : 'default'}>
                      {item.label} ({item.key})
                    </Tag>
                  ))}
                </Space>
              </Form.Item>
              {channelType === 'inbox' ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="站内信模式下 userNickname 可留空，系统会按收件人昵称自动填充。"
                />
              ) : null}
              {selectedTemplate.variables.map((item) => (
                <Form.Item
                  key={item.key}
                  label={`${item.label} (${item.key})`}
                  name={['variableValues', item.key]}
                  rules={[
                    {
                      required: isVariableRequired(item),
                      message: `请填写${item.label}`
                    }
                  ]}
                >
                  <Input placeholder={`请输入${item.label}`} />
                </Form.Item>
              ))}
            </>
          ) : (
            <Alert type="warning" showIcon message="当前模板未配置变量，如模板中引用变量可能导致发送失败。" />
          )}
        </Form>
      </Modal>

      <Drawer
        title="发送详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={860}
        destroyOnClose
      >
        {detailLoading ? (
          <div>加载中...</div>
        ) : !detail ? (
          <div>暂无数据</div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="发布ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="模板">{detail.template?.name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="通道">{detail.channelType === 'inbox' ? '站内信' : '飞书'}</Descriptions.Item>
              <Descriptions.Item label="状态">{renderStatusTag(detail.status)}</Descriptions.Item>
              <Descriptions.Item label="标题" span={2}>
                {detail.payload?.title ?? detail.template?.name ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="收件人" span={2}>
                {(detail.payload?.recipients ?? []).join('、') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="重试次数">{detail.retryCount ?? 0}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detail.createdAt ?? '-'}</Descriptions.Item>
            </Descriptions>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
              <Typography.Text strong>变量映射</Typography.Text>
              {Object.keys(detail.payload?.variables ?? {}).length ? (
                <AppTable
                  rowKey="key"
                  size="small"
                  pagination={false}
                  style={{ marginTop: 8 }}
                  dataSource={Object.entries(detail.payload?.variables ?? {}).map(([key, value]) => ({
                    key,
                    value
                  }))}
                  columns={[
                    { title: '变量', dataIndex: 'key', width: 240 },
                    { title: '值', dataIndex: 'value' }
                  ]}
                />
              ) : (
                <div style={{ marginTop: 8, color: '#999' }}>无变量</div>
              )}
            </div>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
              <Typography.Text strong>消息预览</Typography.Text>
              <Descriptions
                size="small"
                column={1}
                style={{ marginTop: 8 }}
                items={[
                  {
                    key: 'raw-template',
                    label: '原始模板',
                    children: (
                      <div
                        style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10 }}
                        dangerouslySetInnerHTML={{ __html: detail.template?.content ?? '-' }}
                      />
                    )
                  },
                  {
                    key: 'rendered-template',
                    label: '渲染后内容',
                    children: (
                      <div
                        style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10 }}
                        dangerouslySetInnerHTML={{
                          __html: renderContent(detail.template?.content, detail.payload?.variables)
                        }}
                      />
                    )
                  }
                ]}
              />
            </div>

            {detail.messages?.length ? (
              <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                <Typography.Text strong>站内信发送明细</Typography.Text>
                <AppTable
                  rowKey="id"
                  size="small"
                  style={{ marginTop: 8 }}
                  pagination={false}
                  dataSource={detail.messages}
                  columns={[
                    {
                      title: '用户',
                      dataIndex: 'user',
                      render: (user: { username: string; nickname?: string }) =>
                        user ? `${user.nickname ?? user.username} (${user.username})` : '-'
                    },
                    { title: '标题', dataIndex: 'title' },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (value: string) => (value === 'read' ? '已读' : '未读')
                    },
                    { title: '已读时间', dataIndex: 'readAt' }
                  ]}
                />
              </div>
            ) : null}
          </Space>
        )}
      </Drawer>
    </div>
  );
};
