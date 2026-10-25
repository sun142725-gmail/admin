// 底部运行控制台：实时日志时间线 + 产物预览 + 取消/重跑/跳转历史。
import { DownOutlined, ReloadOutlined, StopOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Tooltip } from 'antd';
import type { FlowRunVo } from '../../../api/flows';
import { RUN_MODE_META, RUN_STATUS_META, RunOutputsView } from '../flowRunUI';

export interface RunLogLine {
  key: string;
  time: string;
  text: string;
  kind: 'info' | 'success' | 'error' | 'muted';
}

interface RunPanelProps {
  open: boolean;
  onToggle: () => void;
  run: FlowRunVo | null;
  logs: RunLogLine[];
  onCancel: () => void;
  onRetry: () => void;
}

const LOG_COLOR: Record<RunLogLine['kind'], string> = {
  info: '#1677ff',
  success: '#52c41a',
  error: '#ff4d4f',
  muted: '#8c8c8c'
};

const now = () =>
  new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const formatLogTime = now;

export const RunPanel: React.FC<RunPanelProps> = ({ open, onToggle, run, logs, onCancel, onRetry }) => {
  const statusMeta = run ? RUN_STATUS_META[run.status] ?? { label: run.status, color: 'default' } : null;
  const modeMeta = run ? RUN_MODE_META[run.mode] ?? { label: run.mode, color: 'default' } : null;
  const running = run?.status === 'running' || run?.status === 'pending';

  return (
    <div className="flow-run-panel">
      <div className="flow-run-panel-header" style={{ flexWrap: 'wrap', rowGap: 4 }} onClick={onToggle}>
        {open ? <DownOutlined /> : <UpOutlined />}
        <span style={{ fontWeight: 600 }}>运行控制台</span>
        {run && (
          <>
            <Tag color={modeMeta?.color}>
              {modeMeta?.label} #{run.id}
            </Tag>
            <Tag color={statusMeta?.color}>{statusMeta?.label}</Tag>
          </>
        )}
        <span style={{ flex: 1 }} />
        {run && (
          <Space onClick={(event) => event.stopPropagation()}>
            {running && (
              <Tooltip title="取消本次运行">
                <Button size="small" danger icon={<StopOutlined />} onClick={onCancel}>
                  取消
                </Button>
              </Tooltip>
            )}
            {!running && run.mode === 'run' && (
              <Tooltip title="复用已成功节点的产物，从失败处继续">
                <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
                  断点重跑
                </Button>
              </Tooltip>
            )}
          </Space>
        )}
      </div>
      {open && (
        <div className="flow-run-panel-body">
          {logs.length === 0 && (
            <div style={{ color: 'var(--text-sub)', fontSize: 12, padding: '8px 0' }}>
              点击工具栏「运行」执行任务流，节点状态与产物会实时显示在这里。
            </div>
          )}
          {logs.map((line) => (
            <div className="flow-run-log-line" key={line.key}>
              <span className="flow-run-log-time">{line.time}</span>
              <span style={{ color: LOG_COLOR[line.kind] }}>{line.text}</span>
            </div>
          ))}
          {run && run.outputs && <RunOutputsView outputs={run.outputs} />}
        </div>
      )}
    </div>
  );
};
