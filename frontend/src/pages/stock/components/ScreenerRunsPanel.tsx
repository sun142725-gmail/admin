// 每日扫描面板：收盘定时扫描的运行历史与命中清单，支持手动触发与轮询刷新。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  ScreenerHit,
  ScreenerRun,
  getScreenerRun,
  listScreenerRuns,
  triggerScreenerRun
} from '../../../api/screener';
import { FREQ_LABEL, renderPct, renderPrice, renderSignal, starColumn } from './screener-shared';
import { isStockRowClickIgnored, KlineDrawer } from './KlineDrawer';

const RUN_STATUS: Record<ScreenerRun['status'], { color: string; label: string }> = {
  running: { color: 'processing', label: '运行中' },
  completed: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' }
};

interface RunsPanelProps {
  favoriteSymbols: Set<string>;
  onToggleFavorite: (symbol: string, name: string) => void;
}

export const ScreenerRunsPanel: React.FC<RunsPanelProps> = ({ favoriteSymbols, onToggleFavorite }) => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<ScreenerRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ run: ScreenerRun; hits: ScreenerHit[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  // K 线抽屉：点击命中股票行弹出日K
  const [klineTarget, setKlineTarget] = useState<{ symbol: string; name: string } | null>(null);
  const pollTimer = useRef<number | null>(null);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const res = await listScreenerRuns(1, 20);
      const items = res.items ?? [];
      setRuns(items);
      // 默认选中最近一条
      setSelectedRunId((prev) => prev ?? items[0]?.id ?? null);
    } catch {
      message.error('运行历史加载失败');
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (runId: number | null) => {
    if (!runId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      setDetail(await getScreenerRun(runId));
    } catch {
      message.error('运行详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
      }
    };
  }, [loadRuns]);

  useEffect(() => {
    void loadDetail(selectedRunId);
  }, [selectedRunId, loadDetail]);

  // 存在运行中的任务时每 5 秒轮询，直到完成或 10 分钟超时
  const hasRunning = runs.some((run) => run.status === 'running');
  useEffect(() => {
    if (!hasRunning) {
      return;
    }
    const startedAt = Date.now();
    pollTimer.current = window.setInterval(() => {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        if (pollTimer.current) {
          window.clearInterval(pollTimer.current);
        }
        return;
      }
      void loadRuns();
    }, 5000);
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [hasRunning, loadRuns]);

  const onTrigger = async () => {
    setTriggering(true);
    try {
      // 默认全市场配置（三大板块市值 Top 500 × 日线），后台执行
      await triggerScreenerRun();
      message.success('扫描已启动：全市场成交额 Top 1500，预计几分钟，完成后自动出现在列表');
      await loadRuns();
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : '触发失败');
    } finally {
      setTriggering(false);
    }
  };

  const hitColumns = useMemo<ColumnsType<ScreenerHit>>(
    () => [
      starColumn(favoriteSymbols, onToggleFavorite),
      {
        title: '代码',
        dataIndex: 'symbol',
        width: 110,
        render: (v: string) => <span className="font-mono">{v.toUpperCase()}</span>
      },
      { title: '名称', dataIndex: 'name', width: 120, render: (v: string, record: ScreenerHit) => (
        <Button type="link" size="small" className="!px-0" onClick={() => setKlineTarget({ symbol: record.symbol, name: v || record.symbol })}>
          {v || '-'}
        </Button>
      ) },
      {
        title: '周期',
        dataIndex: 'freq',
        width: 80,
        render: (v: ScreenerHit['freq']) => <Tag color="blue">{FREQ_LABEL[v]}</Tag>
      },
      {
        title: '最新价',
        dataIndex: 'lastClose',
        width: 100,
        render: (v: number | string | null) => renderPrice(v)
      },
      { title: '涨跌幅', dataIndex: 'pct1d', width: 100, render: (v: number | null) => renderPct(v) },
      {
        title: '信号',
        key: 'signal',
        width: 170,
        render: (_: unknown, record: ScreenerHit) => (
          <Space size={4}>
            {renderSignal({
              status: record.signalType,
              barsAgo: record.barsAgo ?? undefined
            })}
            {record.signalSource === 'both' && <Tag color="purple">双指标</Tag>}
            {record.signalSource !== 'both' && (
              <Tag>{record.signalSource.toUpperCase()}</Tag>
            )}
          </Space>
        )
      },
      {
        title: '操作',
        key: 'action',
        width: 130,
        render: (_: unknown, record: ScreenerHit) => (
          <Button
            size="small"
            type="link"
            onClick={() =>
              navigate(
                `/stock?symbol=${encodeURIComponent(record.symbol)}&name=${encodeURIComponent(record.name || record.symbol)}`
              )
            }
          >
            去圆桌分析
          </Button>
        )
      }
    ],
    [favoriteSymbols, onToggleFavorite, navigate]
  );

  return (
    <div className="flex flex-col gap-4">
      <Alert
        type="info"
        showIcon
        message="每个交易日收盘后（15:30）自动扫描全市场成交额 Top 1500 的日线金叉信号并留存结果，开盘前直接看结论。"
        action={
          <Space>
            <Button
              size="small"
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={triggering}
              disabled={hasRunning}
              onClick={() => void onTrigger()}
            >
              立即扫描
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadRuns()}>
              刷新
            </Button>
          </Space>
        }
      />

      <Table
        rowKey="id"
        size="small"
        loading={runsLoading}
        dataSource={runs}
        pagination={false}
        locale={{ emptyText: '还没有扫描记录：点击「立即扫描」或等下一个交易日收盘' }}
        columns={[
          {
            title: '运行时间',
            dataIndex: 'createdAt',
            width: 170,
            render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false })
          },
          { title: '候选池', dataIndex: 'poolDesc', width: 200 },
          {
            title: '扫描/命中',
            key: 'count',
            width: 120,
            render: (_: unknown, record: ScreenerRun) => `${record.scanned} / ${record.matched}`
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v: ScreenerRun['status'], record: ScreenerRun) => (
              <Tooltip title={record.errorMessage ?? undefined}>
                <Tag color={RUN_STATUS[v].color}>{RUN_STATUS[v].label}</Tag>
              </Tooltip>
            )
          },
          {
            title: '耗时',
            dataIndex: 'durationMs',
            width: 90,
            render: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}s` : `${v}ms`)
          },
          {
            title: '操作',
            key: 'action',
            width: 90,
            render: (_: unknown, record: ScreenerRun) => (
              <Button size="small" type="link" onClick={() => setSelectedRunId(record.id)}>
                查看
              </Button>
            )
          }
        ]}
        rowClassName={(record: ScreenerRun) => (record.id === selectedRunId ? 'ant-table-row-selected' : '')}
      />

      {detail?.run && (
        <div>
          <div className="mb-2 text-sm" style={{ color: '#64748b' }}>
            {detail.run.runDate} · {detail.run.poolDesc} · 命中 {detail.run.matched} 只
          </div>
          <Table
            rowKey="id"
            size="middle"
            loading={detailLoading}
            dataSource={detail.hits}
            columns={hitColumns}
            onRow={(record: ScreenerHit) => ({
              onClick: (event) => {
                if (!isStockRowClickIgnored(event)) {
                  setKlineTarget({ symbol: record.symbol, name: record.name || record.symbol });
                }
              },
              style: { cursor: 'pointer' }
            })}
            pagination={detail.hits.length > 50 ? { pageSize: 50, showTotal: (t) => `共 ${t} 条` } : false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: '该次运行没有命中（或尚未完成）' }}
          />
        </div>
      )}

      <KlineDrawer
        open={!!klineTarget}
        symbol={klineTarget?.symbol ?? null}
        name={klineTarget?.name}
        onClose={() => setKlineTarget(null)}
      />
    </div>
  );
};
