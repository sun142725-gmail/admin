// 模型管理页：一行模型 = 一个可调用端点（协议 + 请求地址 + API Key），同名模型多行互为备份。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Tag,
  message
} from 'antd';
import { ApiOutlined, PlusOutlined } from '@ant-design/icons';
import { AppTable } from '../../components/AppTable';
import { Permission } from '../../components/permission/Permission';
import {
  AiModel,
  createModel,
  listModels,
  probeModelModels,
  removeModel,
  testModel,
  updateModel
} from '../../api/ai';

const TYPE_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI 兼容（DeepSeek/通义/Kimi/网关）' },
  { value: 'ollama', label: 'Ollama（预留）' }
];

const CAPABILITY_OPTIONS = [
  { value: 'chat', label: '对话' },
  { value: 'image', label: '生图' },
  { value: 'vision', label: '视觉理解' },
  { value: 'embedding', label: '向量' }
];

const typeLabel = (type: string) => TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;

interface ModelFormValues {
  modelKey?: string;
  displayName: string;
  type: string;
  baseUrl: string;
  apiKey?: string;
  capabilities?: string[];
  contextLength?: number;
  maxOutput?: number;
  remark?: string;
}

export const ModelsPage: React.FC = () => {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AiModel | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ModelFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setModels(await listModels());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (record: AiModel) => {
      setEditing(record);
      form.setFieldsValue({
        displayName: record.displayName,
        type: record.type,
        baseUrl: record.baseUrl,
        capabilities: record.capabilities,
        contextLength: record.contextLength,
        maxOutput: record.maxOutput,
        remark: record.remark
      });
      setDrawerOpen(true);
    },
    [form]
  );

  const submit = useCallback(async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        ...values,
        capabilities: values.capabilities?.join(',')
      };
      if (editing) {
        delete payload.modelKey; // 模型 Key 创建后不可改
        if (!payload.apiKey) {
          delete payload.apiKey; // 留空不修改密钥
        }
        await updateModel(editing.id, payload);
        message.success('模型已更新');
      } else {
        await createModel(payload);
        message.success('模型已创建');
      }
      setDrawerOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }, [editing, form, load]);

  const handleTest = useCallback(async (record: AiModel) => {
    const hide = message.loading('测试连通中…', 0);
    try {
      const result = await testModel(record.id);
      if (result.ok) {
        message.success('连通正常');
      } else {
        message.error(result.message ?? '连通失败');
      }
    } finally {
      hide();
    }
  }, []);

  const handleProbe = useCallback(async (record: AiModel) => {
    const hide = message.loading('探测模型中…', 0);
    try {
      const result = await probeModelModels(record.id);
      if (result.ok && result.models?.length) {
        message.info(`探测到 ${result.models.length} 个模型：${result.models.slice(0, 8).join('、')}`);
      } else if (result.ok) {
        message.info('连接正常，但未探测到模型列表');
      } else {
        message.error(result.message ?? '探测失败');
      }
    } finally {
      hide();
    }
  }, []);

  const handleRemove = useCallback(
    async (record: AiModel) => {
      await removeModel(record.id);
      message.success('已删除');
      await load();
    },
    [load]
  );

  const columns = useMemo(
    () => [
      { title: '模型 Key', dataIndex: 'modelKey', key: 'modelKey' },
      { title: '显示名', dataIndex: 'displayName', key: 'displayName' },
      {
        title: '协议',
        dataIndex: 'type',
        key: 'type',
        width: 130,
        render: (type: string) => <Tag>{typeLabel(type)}</Tag>
      },
      { title: '请求地址', dataIndex: 'baseUrl', key: 'baseUrl', ellipsis: true },
      { title: 'API Key', dataIndex: 'apiKeyMask', key: 'apiKeyMask', width: 120 },
      {
        title: '能力',
        dataIndex: 'capabilities',
        key: 'capabilities',
        render: (capabilities: string[]) => capabilities.map((item) => <Tag key={item}>{item}</Tag>)
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (status: number) =>
          status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>
      },
      {
        title: '操作',
        key: 'actions',
        width: 260,
        render: (_: unknown, record: AiModel) => (
          <Space>
            <Button size="small" icon={<ApiOutlined />} onClick={() => void handleTest(record)}>
              测试
            </Button>
            <Button size="small" onClick={() => void handleProbe(record)}>
              探测
            </Button>
            <Permission code="ai:model:manage">
              <>
                <Button size="small" type="link" onClick={() => openEdit(record)}>
                  编辑
                </Button>
                <Popconfirm
                  title="删除后引用该模型的智能体将无法使用，确认？"
                  onConfirm={() => void handleRemove(record)}
                >
                  <Button size="small" type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </>
            </Permission>
          </Space>
        )
      }
    ],
    [handleProbe, handleRemove, handleTest, openEdit]
  );

  return (
    <Card
      title="模型管理"
      styles={{ body: { padding: 12 } }}
      extra={
        <Permission code="ai:model:manage">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建模型
          </Button>
        </Permission>
      }
    >
      <AppTable<AiModel> rowKey="id" loading={loading} columns={columns} dataSource={models} pagination={false} />

      <Drawer
        title={editing ? `编辑模型：${editing.displayName}` : '新建模型'}
        width={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            type: 'openai-compatible',
            capabilities: ['chat'],
            contextLength: 8192,
            maxOutput: 4096
          }}
        >
          <Form.Item name="type" label="协议类型" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="请求地址"
            rules={[{ required: true, message: '请输入请求地址' }]}
            extra="如 https://api.deepseek.com/v1（结尾斜杠会自动去除）"
          >
            <Input placeholder="https://api.deepseek.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={editing ? `API Key（${editing.apiKeyMask}，留空不修改）` : 'API Key'}
            rules={editing ? [] : [{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder={editing ? '留空保持原密钥' : 'sk-...'} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="displayName" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}>
            <Input maxLength={64} placeholder="DeepSeek Chat" />
          </Form.Item>
          <Form.Item
            name="modelKey"
            label="模型 ID"
            rules={[{ required: true, message: '请输入模型 ID' }]}
            extra="请求上游时的模型名，如 deepseek-chat；同名多行（不同地址）互为备份"
          >
            <Input maxLength={64} placeholder="deepseek-chat" disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="capabilities" label="能力标签">
            <Select mode="multiple" options={CAPABILITY_OPTIONS} />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item name="contextLength" label="上下文长度">
              <InputNumber min={512} className="w-[120px]" />
            </Form.Item>
            <Form.Item name="maxOutput" label="最大输出">
              <InputNumber min={64} className="w-[120px]" />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={255} />
          </Form.Item>
        </Form>
      </Drawer>
    </Card>
  );
};
