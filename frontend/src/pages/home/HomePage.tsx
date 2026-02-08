// 首页展示系统资源与进程概览。
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { fetchDashboardOverview, DashboardOverview } from '../../api/dashboard';

const { Title, Paragraph } = Typography;

export const HomePage: React.FC = () => {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await fetchDashboardOverview();
      setData(res);
    } catch (error) {
      const msg = getErrorMessage(error, '获取系统监控信息失败');
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = window.setInterval(() => loadData(true), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const uptimeText = useMemo(() => formatDuration(data?.uptimeSeconds ?? 0), [data?.uptimeSeconds]);
  const nodeUptimeText = useMemo(
    () => formatDuration(data?.nodeProcess.uptimeSeconds ?? 0),
    [data?.nodeProcess.uptimeSeconds]
  );

  const processColumns: ColumnsType<DashboardOverview['topProcesses'][number]> = [
    { title: 'PID', dataIndex: 'pid', width: 90 },
    {
      title: 'CPU',
      dataIndex: 'cpu',
      width: 120,
      render: (value: number) => `${value.toFixed(2)}%`
    },
    {
      title: '内存',
      dataIndex: 'memory',
      width: 120,
      render: (value: number) => `${value.toFixed(2)}%`
    },
    { title: '进程', dataIndex: 'command' }
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Title level={3} style={{ marginBottom: 0 }}>
          系统资源总览
        </Title>
        <Space>
          <Tooltip
            title={
              <div>
                <div>内存口径: 使用率 = (total - available) / total</div>
                <div>说明: available 包含可回收缓存，更接近 free -h 的可用内存。</div>
                <div style={{ marginTop: 8 }}>
                  原始值:
                  <br />
                  total: {formatBytes(data?.memory.totalBytes ?? 0)}
                  <br />
                  used: {formatBytes(data?.memory.usedBytes ?? 0)}
                  <br />
                  available: {formatBytes(data?.memory.freeBytes ?? 0)}
                </div>
              </div>
            }
          >
            <QuestionCircleOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          </Tooltip>
          <Tag color="blue">{dayjs().format('YYYY-MM-DD HH:mm:ss')}</Tag>
          <Button onClick={() => loadData()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Space>
      <Paragraph style={{ marginBottom: 16 }}>展示服务器资源、Node 进程状态与进程占用 TOP，自动每 15 秒刷新。</Paragraph>

      {!data && !loading && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="暂无监控数据"
          description="请确认当前账号具备首页监控权限（system:dashboard:view）。"
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="CPU 使用率" value={data?.cpu.usagePercent ?? 0} suffix="%" precision={2} />
            <Progress style={{ marginTop: 12 }} percent={data?.cpu.usagePercent ?? 0} showInfo={false} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="内存使用率" value={data?.memory.usagePercent ?? 0} suffix="%" precision={2} />
            <Progress style={{ marginTop: 12 }} percent={data?.memory.usagePercent ?? 0} showInfo={false} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="磁盘使用率" value={data?.disk?.usagePercent ?? 0} suffix="%" precision={2} />
            <Progress style={{ marginTop: 12 }} percent={data?.disk?.usagePercent ?? 0} showInfo={false} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 4 }}>
        <Col xs={24} md={12}>
          <Card title="服务器信息">
            <p>主机名: {data?.hostname ?? '-'}</p>
            <p>系统: {data?.platform ?? '-'}</p>
            <p>系统运行时长: {uptimeText}</p>
            <p>CPU 核心数: {data?.cpu.cores ?? '-'}</p>
            <p>Load Avg: {(data?.loadAverage ?? []).map((item) => item.toFixed(2)).join(' / ') || '-'}</p>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Node 进程信息">
            <p>PID: {data?.nodeProcess.pid ?? '-'}</p>
            <p>进程运行时长: {nodeUptimeText}</p>
            <p>RSS: {formatBytes(data?.nodeProcess.rssBytes ?? 0)}</p>
            <p>Heap Used: {formatBytes(data?.nodeProcess.heapUsedBytes ?? 0)}</p>
            <p>总内存: {formatBytes(data?.memory.totalBytes ?? 0)}</p>
          </Card>
        </Col>
      </Row>

      <Card title="进程占用 TOP（按 CPU）" style={{ marginTop: 16 }}>
        <Table
          rowKey="pid"
          loading={loading}
          columns={processColumns}
          dataSource={data?.topProcesses ?? []}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
};

const formatBytes = (bytes: number) => {
  if (!bytes) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index > 1 ? 2 : 0)} ${units[index]}`;
};

const formatDuration = (seconds: number) => {
  if (!seconds) {
    return '-';
  }
  const day = Math.floor(seconds / 86400);
  const hour = Math.floor((seconds % 86400) / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  return `${day}天 ${hour}小时 ${minute}分钟`;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object') {
    const responseMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (responseMessage) {
      return responseMessage;
    }
    const directMessage = (error as { message?: string }).message;
    if (directMessage) {
      return directMessage;
    }
  }
  return fallback;
};
