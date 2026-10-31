// 任务流列表页：卡片网格展示，支持新建/编辑跳转/复制/删除/启停，最近运行状态一眼可见。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Empty from 'antd/es/empty';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Spin from 'antd/es/spin';
import Switch from 'antd/es/switch';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
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
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { ConfirmPopconfirm } from '../../components/business/ConfirmAction';
import { PageHeader } from '../../components/business/PageHeader';
import { StatusTag } from '../../components/business/StatusTag';
import { useApiMessage } from '../../hooks/useApiMessage';
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
  const msg = useApiMessage();

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
      msg.success('已创建，默认带一套 AI 视频生产模板');
      setCreateOpen(false);
      form.resetFields();
      navigate(`/flow/editor/${created.id}`);
    } finally {
      setCreating(false);
    }
  }, [form, navigate, msg]);

  const toggleStatus = useCallback(
    async (flow: FlowSummary) => {
      try {
        await updateFlow(flow.id, { status: flow.status === 1 ? 0 : 1 });
        await load();
      } catch (error) {
        msg.errorFrom(error, '操作失败');
      }
    },
    [load, msg]
  );

  const duplicate = useCallback(
    async (flow: FlowSummary) => {
      try {
        await duplicateFlow(flow.id);
        msg.success('已复制');
        await load();
      } catch (error) {
        msg.errorFrom(error, '复制失败');
      }
    },
    [load, msg]
  );

  const remove = useCallback(
    async (flow: FlowSummary) => {
      try {
        await deleteFlow(flow.id);
        msg.success('已删除');
        await load();
      } catch (error) {
        msg.errorFrom(error, '删除失败');
      }
    },
    [load, msg]
  );

  return (
    <div>
      {/* flow-page-header 自绘 flex 迁 PageHeader：标题左/操作右由 page-toolbar justify-between 承担（README 收编写法） */}
      <PageHeader
        className="flex-wrap gap-y-1"
        title="任务流"
        subtitle="AI 视频生成的画布编排：LLM 分镜 → 首帧生图 → 图生视频，支持单节点调试与断点重跑"
        actions={
          <>
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
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <Empty description={keyword ? '没有匹配的任务流' : '还没有任务流，新建一个开始编排'} className="py-15">
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
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))]">
          {filtered.map((flow) => {
            const lastRun = flow.lastRun;
            return (
              <Card
                key={flow.id}
                hoverable
                styles={{ body: { padding: 16 } }}
                onClick={() => navigate(`/flow/editor/${flow.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="text-[30px] leading-none">{flow.icon ?? '🎬'}</div>
                  <div className="flex-1 min-w-0">
                    <Space size={6}>
                      <Typography.Text strong className="text-[15px]">
                        {flow.name}
                      </Typography.Text>
                      <Tag>V{flow.version}</Tag>
                      {flow.status !== 1 && <Tag color="red">已停用</Tag>}
                    </Space>
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      className="!mb-2 mt-1 text-xs"
                    >
                      {flow.description || `${flow.nodeCount} 个节点`}
                    </Typography.Paragraph>
                    <div className="flex items-center gap-1.5 text-xs">
                      {lastRun ? (
                        <>
                          <StatusTag value={lastRun.status} map={RUN_STATUS_META} />
                          <span className="text-text-sub">
                            {lastRun.finishedAt
                              ? `上次运行 ${new Date(lastRun.finishedAt).toLocaleString('zh-CN', { hour12: false })}`
                              : '上次运行未完成'}
                          </span>
                        </>
                      ) : (
                        <span className="text-text-sub">尚未运行</span>
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
                        <ConfirmPopconfirm title="确认删除？" onConfirm={() => remove(flow)} okText="删除" cancelText="取消">
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </ConfirmPopconfirm>
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

      <SelfModal
        title="新建任务流"
        open={createOpen}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
        okText="创建并编辑"
        confirmLoading={creating}
        destroyOnHidden
      >
        <SelfForm form={form} initialValues={{ icon: '🎬' }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：短视频流水线" maxLength={64} />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Select options={ICON_OPTIONS} className="w-20" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="这个任务流做什么（可选）" maxLength={255} />
          </Form.Item>
        </SelfForm>
      </SelfModal>
    </div>
  );
};
