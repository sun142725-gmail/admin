// 任务流列表页：卡片网格展示，支持新建/编辑跳转/复制/删除/启停，最近运行状态一眼可见。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { Permission } from '../../components/permission/Permission';
import {
  FlowSummary,
  createFlow,
  deleteFlow,
  duplicateFlow,
  listFlows,
  updateFlow
} from '../../api/flows';
import { RUN_STATUS_META } from './flowRunUI';
import './flow-pages.css';

const ICON_OPTIONS = ['🎬', '📱', '✨', '🎵', '🎯', '🧪', '🚀', '📊', '🐱', '🌊'].map((value) => ({
  value,
  label: value
}));

interface FlowFormValues {
  name: string;
  description?: string;
  icon?: string;
}

export const FlowsPage: React.FC = () => {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<FlowFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFlows(await listFlows());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      flows.filter(
        (flow) =>
          !keyword ||
          flow.name.includes(keyword) ||
          (flow.description ?? '').includes(keyword)
      ),
    [flows, keyword]
  );

  const submitCreate = useCallback(async () => {
    const values = await form.validateFields();
    setCreating(true);
    try {
      const created = await createFlow(values);
      message.success('已创建，默认带一套 AI 视频生产模板');
      setCreateOpen(false);
      form.resetFields();
      navigate(`/flow/editor/${created.id}`);
    } finally {
      setCreating(false);
    }
  }, [form, navigate]);

  const toggleStatus = useCallback(
    async (flow: FlowSummary) => {
      try {
        await updateFlow(flow.id, { status: flow.status === 1 ? 0 : 1 });
        await load();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '操作失败');
      }
    },
    [load]
  );

  const duplicate = useCallback(
    async (flow: FlowSummary) => {
      try {
        await duplicateFlow(flow.id);
        message.success('已复制');
        await load();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '复制失败');
      }
    },
    [load]
  );

  const remove = useCallback(
    async (flow: FlowSummary) => {
      try {
        await deleteFlow(flow.id);
        message.success('已删除');
        await load();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '删除失败');
      }
    },
    [load]
  );

  return (
    <div>
      <div className="flow-page-header">
        <Typography.Title level={4} className="flow-page-header-title">
          任务流
        </Typography.Title>
        <Typography.Text className="flow-page-header-desc">
          AI 视频生成的画布编排：LLM 分镜 → 首帧生图 → 图生视频，支持单节点调试与断点重跑
        </Typography.Text>
        <span className="flow-page-header-spacer" />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索名称/描述"
          className="flow-page-header-search"
          style={{ width: 200 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
        <Permission code="flow:define:manage">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建任务流
          </Button>
        </Permission>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <Empty description={keyword ? '没有匹配的任务流' : '还没有任务流，新建一个开始编排'} style={{ padding: 60 }}>
          {!keyword ? (
            <Permission code="flow:define:manage">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建任务流
              </Button>
            </Permission>
          ) : (
            <span />
          )}
        </Empty>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
            gap: 16
          }}
        >
          {filtered.map((flow) => {
            const lastRun = flow.lastRun;
            const lastRunMeta = lastRun ? RUN_STATUS_META[lastRun.status] : null;
            return (
              <Card
                key={flow.id}
                hoverable
                styles={{ body: { padding: 16 } }}
                onClick={() => navigate(`/flow/editor/${flow.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 30, lineHeight: 1 }}>{flow.icon ?? '🎬'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={6}>
                      <Typography.Text strong style={{ fontSize: 15 }}>
                        {flow.name}
                      </Typography.Text>
                      <Tag>V{flow.version}</Tag>
                      {flow.status !== 1 && <Tag color="red">已停用</Tag>}
                    </Space>
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      style={{ marginBottom: 8, marginTop: 4, fontSize: 12 }}
                    >
                      {flow.description || `${flow.nodeCount} 个节点`}
                    </Typography.Paragraph>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      {lastRun ? (
                        <>
                          <Tag color={lastRunMeta?.color} style={{ marginRight: 0 }}>
                            {lastRunMeta?.label ?? lastRun.status}
                          </Tag>
                          <span style={{ color: 'var(--text-sub)' }}>
                            {lastRun.finishedAt
                              ? `上次运行 ${new Date(lastRun.finishedAt).toLocaleString('zh-CN', { hour12: false })}`
                              : '上次运行未完成'}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-sub)' }}>尚未运行</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flow-card-actions" onClick={(event) => event.stopPropagation()}>
                  <Space size={4} wrap>
                    <Permission code="flow:define:manage">
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => navigate(`/flow/editor/${flow.id}`)}
                      >
                        编辑
                      </Button>
                    </Permission>
                    <Permission code="flow:run:view">
                      <Button
                        size="small"
                        icon={<HistoryOutlined />}
                        onClick={() => navigate(`/flow/runs?flowId=${flow.id}`)}
                      >
                        历史
                      </Button>
                    </Permission>
                    <Permission code="flow:define:manage">
                      <Space size={4}>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => duplicate(flow)} />
                        <Popconfirm title="确认删除？" onConfirm={() => remove(flow)} okText="删除" cancelText="取消">
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                        <Switch
                          size="small"
                          checked={flow.status === 1}
                          onChange={() => toggleStatus(flow)}
                        />
                      </Space>
                    </Permission>
                  </Space>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title="新建任务流"
        open={createOpen}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
        okText="创建并编辑"
        confirmLoading={creating}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ icon: '🎬' }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：短视频流水线" maxLength={64} />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Select options={ICON_OPTIONS} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="这个任务流做什么（可选）" maxLength={255} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
