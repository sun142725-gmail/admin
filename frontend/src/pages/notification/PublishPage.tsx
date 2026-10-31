// 通知发布页面提供发布弹窗与发送记录查询。
import React, { useEffect, useMemo, useState } from 'react';
import { sanitizeHtml } from '../../utils/sanitize';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Descriptions from 'antd/es/descriptions';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { Permission } from '../../components/permission/Permission';
import { SelfDrawer } from '../../components/base/SelfDrawer';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfTable } from '../../components/base/SelfTable';
import { FilterBar } from '../../components/business/FilterBar';
import { StatusTag } from '../../components/business/StatusTag';
import { useApiMessage } from '../../hooks/useApiMessage';
import { useTableQuery } from '../../hooks/useTableQuery';
import type { StatusMeta } from '../../types/ui';
import {
  getNotificationPublishDetail,
  listNotificationPublishes,
  listNotificationTemplates,
  publishNotification,
  retryNotificationPublish
} from '../../api/notification';
import { batchDicts } from '../../api/dict';
import { listUsers } from '../../api/users';

interface TemplateItem {
  id: number;
  name: string;
  content?: string;
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

const DEFAULT_CHANNEL_OPTIONS = [
  { label: '短信', value: 'sms' },
  { label: '邮箱', value: 'email' },
  { label: '站内信', value: 'inbox' },
  { label: '飞书', value: 'feishu' }
];

// 状态色刻度（components/README.md）：收编原 renderStatusTag 页内映射表，未命中回退原值 default Tag。
const PUBLISH_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '待发送', color: 'default' },
  sending: { label: '发送中', color: 'processing' },
  success: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' }
};

export const PublishPage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<PublishDetail | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: number; nickname?: string; username: string }>>([]);
  const [publishForm] = Form.useForm();
  const [queryForm] = Form.useForm<QueryValues>();
  const [channelLabelMap, setChannelLabelMap] = useState<Record<string, string>>({});
  const [channelItems, setChannelItems] = useState<Array<{ value: string; label: string }>>([]);
  const msg = useApiMessage();

  const table = useTableQuery<PublishItem, QueryValues>({
    fetcher: ({ page, pageSize, filters }) =>
      listNotificationPublishes({
        ...filters,
        templateId: filters.templateId ? Number(filters.templateId) : undefined,
        page,
        pageSize
      }),
    defaultPageSize: 20
  });

  const channelType = Form.useWatch('channelType', publishForm);
  const templateId = Form.useWatch('templateId', publishForm);

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
  }, []);

  useEffect(() => {
    batchDicts({ codes: 'MESSAGE_CHANNEL' })
      .then((data) => {
        const list = (data?.MESSAGE_CHANNEL ?? []) as Array<{ value: string; label: string }>;
        const map: Record<string, string> = {};
        list.forEach((item) => {
          map[item.value] = item.label;
        });
        setChannelLabelMap(map);
        setChannelItems(list);
      })
      .catch(() => {
        setChannelLabelMap({});
        setChannelItems([]);
      });
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
    const allOptions = (channelItems.length ? channelItems : DEFAULT_CHANNEL_OPTIONS).map((item) => ({
      ...item,
      label: channelLabelMap[item.value] ?? item.label
    }));
    if (!selectedTemplate?.channelTypes?.length) {
      return allOptions;
    }
    return allOptions.filter((item) => selectedTemplate.channelTypes.includes(item.value));
  }, [selectedTemplate, channelItems, channelLabelMap]);

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
    msg.success('发布成功');
    setOpen(false);
    // 发布成功后按当前筛选回第 1 页（等价原 fetchData(query, 1, pageSize)）
    table.search({ ...table.filters });
  };

  const onRetry = async (item: PublishItem) => {
    await retryNotificationPublish(item.id);
    msg.success('已触发重试');
    table.reload();
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

  const onSearch = async () => {
    const values = queryForm.getFieldsValue();
    const nextQuery: QueryValues = {
      keyword: values.keyword?.trim() || undefined,
      templateId: values.templateId,
      channelType: values.channelType || undefined,
      status: values.status || undefined
    };
    table.search(nextQuery);
  };

  const onReset = async () => {
    queryForm.resetFields();
    table.reset();
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
      render: (value: string) => channelLabelMap[value] ?? value
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string) => (
        <StatusTag value={value} map={PUBLISH_STATUS_META} fallback={{ label: value ?? '-', color: 'default' }} />
      )
    },
    { title: '重试次数', dataIndex: 'retryCount' },
    { title: '失败原因', dataIndex: 'failReason' },
    { title: '创建时间', dataIndex: 'createdAt' },
    {
      title: '操作',
      // 重试按钮带动态 disabled（status !== 'failed'），ActionCell 不支持逐项 disabled，保留原生写法
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
      <FilterBar form={queryForm} onSearch={onSearch} onReset={onReset} formClassName="gap-y-3">
        <Form.Item name="templateId" label="模板">
          <Select
            allowClear
            className="w-[180px]"
            placeholder="请选择模板"
            options={templates.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Form.Item>
        <Form.Item name="channelType" label="通道">
          <Select
            allowClear
            className="w-[140px]"
            placeholder="全部通道"
            options={(channelItems.length ? channelItems : DEFAULT_CHANNEL_OPTIONS).map((item) => ({
              ...item,
              label: channelLabelMap[item.value] ?? item.label
            }))}
          />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select allowClear className="w-[140px]" placeholder="全部状态" options={STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="keyword" label="关键词">
          <Input className="w-[220px]" placeholder="模板名/失败原因" />
        </Form.Item>
      </FilterBar>

      <Space className="mb-4">
        <Permission code="system:notification:publish:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            发布通知
          </Button>
        </Permission>
      </Space>

      <SelfTable
        rowKey="id"
        columns={columns}
        loading={table.loading}
        dataSource={table.data}
        pagination={table.pagination}
      />

      <SelfModal title="发布通知" open={open} onOk={onSubmit} onCancel={() => setOpen(false)} width="lg">
        <SelfForm form={publishForm}>
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
              <Form.Item label="模板变量" className="!mb-0">
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
                  className="mb-3"
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
        </SelfForm>
      </SelfModal>

      {/* 860 为刻度外散值（README 归档映射要求专项截图比对后方可收敛，未复核前保持透传） */}
      <SelfDrawer
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
          <Space direction="vertical" className="w-full" size={16}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="发布ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="模板">{detail.template?.name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="通道">{channelLabelMap[detail.channelType] ?? detail.channelType}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <StatusTag value={detail.status} map={PUBLISH_STATUS_META} fallback={{ label: detail.status ?? '-', color: 'default' }} />
              </Descriptions.Item>
              <Descriptions.Item label="标题" span={2}>
                {detail.payload?.title ?? detail.template?.name ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="收件人" span={2}>
                {(detail.payload?.recipients ?? []).join('、') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="重试次数">{detail.retryCount ?? 0}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detail.createdAt ?? '-'}</Descriptions.Item>
            </Descriptions>

            <div className="preview-card">
              <Typography.Text strong>变量映射</Typography.Text>
              {Object.keys(detail.payload?.variables ?? {}).length ? (
                <SelfTable
                  rowKey="key"
                  size="small"
                  pagination={false}
                  className="mt-2"
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
                <div className="mt-2 text-text-sub">无变量</div>
              )}
            </div>

            <div className="preview-card">
              <Typography.Text strong>消息预览</Typography.Text>
              <Descriptions
                size="small"
                column={1}
                className="mt-2"
                items={[
                  {
                    key: 'raw-template',
                    label: '原始模板',
                    children: (
                      <div
                        className="preview-card-sm"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.template?.content ?? '-') }}
                      />
                    )
                  },
                  {
                    key: 'rendered-template',
                    label: '渲染后内容',
                    children: (
                      <div
                        className="preview-card-sm"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(renderContent(detail.template?.content, detail.payload?.variables))
                        }}
                      />
                    )
                  }
                ]}
              />
            </div>

            {detail.messages?.length ? (
              <div className="preview-card">
                <Typography.Text strong>站内信发送明细</Typography.Text>
                <SelfTable
                  rowKey="id"
                  size="small"
                  className="mt-2"
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
      </SelfDrawer>
    </div>
  );
};
