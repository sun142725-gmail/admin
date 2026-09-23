// 智能体管理页：提示词/参数/绑定模型（native）或 Dify 渠道（dify）。
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
import { PlusOutlined } from '@ant-design/icons';
import { AppTable } from '../../components/AppTable';
import { Permission } from '../../components/permission/Permission';
import { AiAgent, AiModel, createAgent, listAgents, listModels, removeAgent, updateAgent } from '../../api/ai';

interface AgentFormValues {
  name: string;
  description?: string;
  kind: 'native' | 'dify';
  code?: string;
  modelId?: number;
  baseUrl?: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  openingLine?: string;
  sort?: number;
}

export const AgentsPage: React.FC = () => {
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AiAgent | null>(null);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<'native' | 'dify'>('native');
  const [form] = Form.useForm<AgentFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentList, modelList] = await Promise.all([listAgents(), listModels()]);
      setAgents(agentList);
      setModels(modelList.filter((item) => item.status === 1 && item.capabilities.includes('chat')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setKind('native');
    form.resetFields();
    setDrawerOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (record: AiAgent) => {
      setEditing(record);
      setKind(record.kind);
      form.setFieldsValue({
        name: record.name,
        description: record.description,
        kind: record.kind,
        code: record.code,
        modelId: record.modelId,
        baseUrl: record.baseUrl,
        systemPrompt: record.systemPrompt,
        temperature: record.temperature,
        topP: record.topP,
        maxTokens: record.maxTokens,
        openingLine: record.openingLine,
        sort: record.sort
      });
      setDrawerOpen(true);
    },
    [form]
  );

  const submit = useCallback(async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updateAgent(editing.id, values);
        message.success('智能体已更新');
      } else {
        await createAgent(values);
        message.success('智能体已创建');
      }
      setDrawerOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }, [editing, form, load]);

  const columns = useMemo(
    () => [
      { title: '名称', dataIndex: 'name', key: 'name' },
      { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
      {
        title: '类型',
        dataIndex: 'kind',
        key: 'kind',
        width: 100,
        render: (kind: string, record: AiAgent) => (
          <Space size={4}>
            {kind === 'dify' ? <Tag color="purple">Dify 应用</Tag> : <Tag>内置编排</Tag>}
            {record.code === 'divination' && <Tag color="gold">六爻解卦</Tag>}
            {record.code && record.code !== 'divination' && <Tag>{record.code}</Tag>}
          </Space>
        )
      },
      {
        title: '提示词摘要',
        dataIndex: 'systemPrompt',
        key: 'systemPrompt',
        ellipsis: true,
        render: (prompt?: string) => prompt?.slice(0, 40) ?? '—'
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
        width: 150,
        render: (_: unknown, record: AiAgent) => (
          <Permission code="ai:agent:manage">
            <Space>
              <Button size="small" type="link" onClick={() => openEdit(record)}>
                编辑
              </Button>
              <Popconfirm
                title="确认删除该智能体？"
                onConfirm={() => {
                  void removeAgent(record.id).then(() => {
                    message.success('已删除');
                    return load();
                  });
                }}
              >
                <Button size="small" type="link" danger>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </Permission>
        )
      }
    ],
    [load, openEdit]
  );

  return (
    <Card
      title="智能体管理"
      styles={{ body: { padding: 12 } }}
      extra={
        <Permission code="ai:agent:manage">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建智能体
          </Button>
        </Permission>
      }
    >
      <AppTable<AiAgent> rowKey="id" loading={loading} columns={columns} dataSource={agents} pagination={false} />

      <Drawer
        title={editing ? `编辑智能体：${editing.name}` : '新建智能体'}
        width={560}
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
          initialValues={{ kind: 'native', temperature: 0.7, sort: 0 }}
          onValuesChange={(changed) => {
            if (changed.kind) {
              setKind(changed.kind);
            }
          }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={64} placeholder="如：六爻解卦师" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'native', label: '内置编排（提示词 + 模型）' },
                { value: 'dify', label: 'Dify 远程应用' }
              ]}
            />
          </Form.Item>
          <Form.Item
            name="code"
            label="业务编码"
            rules={[
              {
                pattern: /^[a-z][a-z0-9_-]*$/,
                message: '小写字母开头，仅含小写字母/数字/中划线/下划线'
              }
            ]}
            extra="业务模块对接锚点，全局唯一；六爻解卦请填 divination"
          >
            <Input maxLength={64} placeholder="divination" allowClear />
          </Form.Item>
          {kind === 'native' ? (
            <Form.Item name="modelId" label="绑定模型" rules={[{ required: true, message: '请选择模型' }]}>
              <Select
                options={models.map((item) => ({
                  value: item.id,
                  label: `${item.displayName}（${item.modelKey}）`
                }))}
                placeholder="选择启用的 chat 模型"
              />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                name="baseUrl"
                label="Dify API 端点"
                rules={[{ required: kind === 'dify' && !editing?.baseUrl, message: '请输入 Dify API 端点' }]}
                extra="如 https://api.dify.ai/v1"
              >
                <Input placeholder="https://api.dify.ai/v1" />
              </Form.Item>
              <Form.Item
                name="apiKey"
                label={editing?.kind === 'dify' ? `API Key（${editing.apiKeyMask ?? ''}，留空不修改）` : 'API Key'}
                rules={
                  editing?.kind === 'dify' && kind === 'dify'
                    ? []
                    : [{ required: kind === 'dify', message: '请输入 Dify 应用 API Key' }]
                }
                extra="Dify 应用密钥，形如 app-xxxxxxxx"
              >
                <Input.Password placeholder="app-..." autoComplete="new-password" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="systemPrompt"
            label="系统提示词（知识承载）"
            extra={kind === 'dify' ? 'Dify 应用的提示词在其平台维护，此处作为 system_prompt 输入传入' : undefined}
          >
            <Input.TextArea
              rows={8}
              maxLength={8000}
              showCount
              className="font-mono"
              placeholder="你是…（角色、规则、知识、输出格式）"
            />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item name="temperature" label="Temperature">
              <InputNumber min={0} max={2} step={0.1} className="w-[110px]" />
            </Form.Item>
            <Form.Item name="topP" label="Top P">
              <InputNumber min={0} max={1} step={0.1} className="w-[110px]" />
            </Form.Item>
            <Form.Item name="maxTokens" label="最大输出">
              <InputNumber min={64} className="w-[110px]" />
            </Form.Item>
            <Form.Item name="sort" label="排序">
              <InputNumber min={0} className="w-[110px]" />
            </Form.Item>
          </Space>
          <Form.Item name="openingLine" label="开场白">
            <Input maxLength={255} placeholder="你好，我是…" />
          </Form.Item>
        </Form>
      </Drawer>
    </Card>
  );
};
