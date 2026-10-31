// 运行历史页：表格 + 详情抽屉（节点时间线/输入输出/错误/产物预览），运行中自动刷新，支持断点重跑。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Descriptions from 'antd/es/descriptions';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Timeline from 'antd/es/timeline';
import Typography from 'antd/es/typography';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { Permission } from '../../components/permission/Permission';
import { SelfDrawer } from '../../components/base/SelfDrawer';
import { SelfTable } from '../../components/base/SelfTable';
import { PageHeader } from '../../components/business/PageHeader';
import { StatusTag } from '../../components/business/StatusTag';
import { useApiMessage } from '../../hooks/useApiMessage';
import {
  FlowRunNodeVo,
  FlowRunVo,
  cancelRun,
  getRunDetail,
  listFlows,
  listRuns,
  retryRun,
} from '../../api/flows';
import { NODE_STATUS_META, RUN_MODE_META, RUN_STATUS_META, RunOutputsView, formatDuration } from './flowRunUI';
import './flow-pages.css';

const STATUS_OPTIONS = [
  { value: 'running', label: '运行中' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' }
];

/** 节点输入/输出 JSON 折叠展示。 */
const JsonBlock: React.FC<{ title: string; value?: Record<string, unknown> | null }> = ({ title, value }) => {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }
  return (
    <div className="mt-1">
      <Typography.Text type="secondary" className="text-xs">
        {title}
      </Typography.Text>
      <pre className="m-1 p-2 rounded-lg text-xs max-h-[220px] overflow-auto bg-[var(--app-bg)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
};

export const FlowRunsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const flowIdParam = searchParams.get('flowId');

  const [runs, setRuns] = useState<FlowRunVo[]>([]);
  const [flowOptions, setFlowOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [flowId, setFlowId] = useState<number | undefined>(flowIdParam ? Number(flowIdParam) : undefined);
  const [status, setStatus] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<{ run: FlowRunVo; nodes: FlowRunNodeVo[] } | null>(null);
  const msg = useApiMessage();

  const load = useCallback(async () => {
    try {
      setRuns(await listRuns({ flowId, status }));
    } finally {
      setLoading(false);
    }
  }, [flowId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listFlows()
      .then((flows) =>
        setFlowOptions(flows.map((flow) => ({ value: flow.id, label: `${flow.icon ?? '🎬'} ${flow.name}` })))
      )
      .catch(() => setFlowOptions([]));
  }, []);

  // 列表里有运行中的记录时每 4 秒自动刷新。
  const hasRunning = useMemo(
    () => runs.some((run) => run.status === 'running' || run.status === 'pending'),
    [runs]
  );
  useEffect(() => {
    if (!hasRunning) {
      return;
    }
    const timer = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [hasRunning, load]);

  const openDetail = useCallback(async (runId: number) => {
    setDetailOpen(true);
    try {
      setDetail(await getRunDetail(runId));
    } catch (error) {
      msg.errorFrom(error, '加载详情失败');
    }
  }, [msg]);

  // 详情抽屉打开时轮询刷新（含运行中详情）
  useEffect(() => {
    if (!detailOpen || !detail) {
      return;
    }
    const active = detail.run.status === 'running' || detail.run.status === 'pending';
    if (!active) {
      return;
    }
    const timer = setInterval(() => {
      getRunDetail(detail.run.id)
        .then(setDetail)
        .catch(() => undefined);
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [detailOpen, detail, load]);

  const columns = useMemo<ColumnsType<FlowRunVo>>(
    () => [
      { title: 'ID', dataIndex: 'id', width: 70 },
      {
        title: '任务流',
        dataIndex: 'flowName',
        width: 200,
        render: (name: string, record) => (
          <Space>
            <span>{record.flowIcon ?? '🎬'}</span>
            <span>{name}</span>
          </Space>
        )
      },
      {
        title: '模式',
        dataIndex: 'mode',
        width: 100,
        render: (mode: string) => <StatusTag value={mode} map={RUN_MODE_META} />
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (value: string) => <StatusTag value={value} map={RUN_STATUS_META} />
      },
      {
        title: '耗时',
        dataIndex: 'durationMs',
        width: 90,
        render: (value: number | null | undefined) => formatDuration(value)
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 170,
        render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })
      },
      {
        title: '操作',
        key: 'actions',
        width: 200,
        // 取消/断点重跑按运行状态互斥切换且带 icon，Permission 为 hide 模式，ActionCell 无法承载，保留原生写法
        render: (_, record) => {
          const running = record.status === 'running' || record.status === 'pending';
          return (
            <Space size={4}>
              <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(record.id)}>
                详情
              </Button>
              <Permission code="flow:run:execute">
                <>
                  {running ? (
                    <Button
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      onClick={() =>
                        cancelRun(record.id)
                          .then(() => {
                            msg.success('已请求取消');
                            void load();
                          })
                          .catch((error: unknown) =>
                            msg.errorFrom(error, '取消失败')
                          )
                      }
                    >
                      取消
                    </Button>
                  ) : record.mode === 'run' ? (
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() =>
                        retryRun(record.id)
                          .then(({ runId }) => {
                            msg.success(`已发起重跑 #${runId}`);
                            void openDetail(runId);
                          })
                          .catch((error: unknown) =>
                            msg.errorFrom(error, '重跑失败')
                          )
                      }
                    >
                      断点重跑
                    </Button>
                  ) : null}
                </>
              </Permission>
            </Space>
          );
        }
      }
    ],
    [openDetail, load, msg]
  );

  return (
    <div>
      {/* flow-page-header 自绘 flex 迁 PageHeader（README 收编写法），标题左/筛选右布局等价 */}
      <PageHeader
        className="flex-wrap gap-y-1"
        title="运行历史"
        actions={
          <>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="全部任务流"
              className="w-[220px]"
              options={flowOptions}
              value={flowId}
              onChange={(value) => {
                setFlowId(value);
                if (value) {
                  setSearchParams({ flowId: String(value) });
                } else {
                  setSearchParams({});
                }
              }}
            />
            <Select
              allowClear
              placeholder="全部状态"
              className="w-[130px]"
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
          </>
        }
      />

      <SelfTable<FlowRunVo>
        rowKey="id"
        columns={columns}
        dataSource={runs}
        loading={loading}
        pagination={{ pageSize: 20 }}
        onRow={(record) => ({ onClick: () => void openDetail(record.id), style: { cursor: 'pointer' } })}
      />

      {/* width=560 即 SelfDrawer md 档默认，零变更 */}
      <SelfDrawer
        title={
          detail ? (
            <Space>
              <span>运行 #{detail.run.id}</span>
              <StatusTag value={detail.run.mode} map={RUN_MODE_META} />
              <StatusTag value={detail.run.status} map={RUN_STATUS_META} />
            </Space>
          ) : (
            '运行详情'
          )
        }
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detail && (
          <>
            <Descriptions
              size="small"
              column={2}
              items={[
                { key: 'flow', label: '任务流', children: detail.run.flowName ?? detail.run.flowId },
                {
                  key: 'created',
                  label: '创建时间',
                  children: detail.run.createdAt
                    ? new Date(detail.run.createdAt).toLocaleString('zh-CN', { hour12: false })
                    : '-'
                },
                { key: 'duration', label: '耗时', children: formatDuration(detail.run.durationMs) },
                {
                  key: 'retry',
                  label: '断点重跑自',
                  children: detail.run.retryOf ? `#${detail.run.retryOf}` : '-'
                }
              ]}
            />
            {detail.run.error && (
              <Alert type="error" showIcon message="运行失败" description={detail.run.error} className="mt-3" />
            )}
            {detail.run.outputs && (
              <div className="mt-3">
                <Typography.Text strong>产物</Typography.Text>
                <RunOutputsView outputs={detail.run.outputs} />
              </div>
            )}
            <Typography.Title level={5} className="!mt-5">
              节点执行
            </Typography.Title>
            <Timeline
              items={detail.nodes.map((node) => {
                const meta = NODE_STATUS_META[node.status] ?? { label: node.status, color: 'default' };
                return {
                  color:
                    node.status === 'succeeded'
                      ? 'green'
                      : node.status === 'failed'
                        ? 'red'
                        : node.status === 'running'
                          ? 'blue'
                          : node.status === 'reused'
                            ? 'purple'
                            : 'gray',
                  children: (
                    <div key={node.id}>
                      <Space size={6} wrap>
                        <Typography.Text strong>{node.name}</Typography.Text>
                        <Tag className="!mr-0">{node.nodeType}</Tag>
                        <Tag color={meta.color} className="!mr-0">
                          {meta.label}
                        </Tag>
                        {node.durationMs !== null && node.durationMs !== undefined && (
                          <Typography.Text type="secondary" className="text-xs">
                            {formatDuration(node.durationMs)}
                          </Typography.Text>
                        )}
                      </Space>
                      {node.error && (
                        <Alert type="error" showIcon={false} message={node.error} className="mt-1.5" />
                      )}
                      <JsonBlock title="输入" value={node.input as Record<string, unknown> | null} />
                      <JsonBlock title="输出" value={node.output as Record<string, unknown> | null} />
                      {typeof node.output?.url === 'string' && (
                        <RunOutputsView outputs={{ url: node.output.url }} />
                      )}
                    </div>
                  )
                };
              })}
            />
            {detail.run.mode === 'run' && (
              <Permission code="flow:run:execute">
                <Space className="mt-2">
                  <Button
                    icon={<ReloadOutlined />}
                    disabled={detail.run.status === 'running' || detail.run.status === 'pending'}
                    onClick={() =>
                      retryRun(detail.run.id)
                        .then(({ runId }) => {
                          msg.success(`已发起重跑 #${runId}`);
                          void openDetail(runId);
                        })
                        .catch((error: unknown) =>
                          msg.errorFrom(error, '重跑失败')
                        )
                    }
                  >
                    断点重跑本次
                  </Button>
                  <Button onClick={() => navigate(`/flow/editor/${detail.run.flowId}`)}>打开画布</Button>
                </Space>
              </Permission>
            )}
          </>
        )}
      </SelfDrawer>
    </div>
  );
};
