// 会议记录：历史列表（回放跳转分析台 + 删除）。
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Tag, message } from 'antd';
import { DeleteOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { AppTable } from '../../../components/AppTable';
import {
  RoundtableListItem,
  listRoundtables,
  removeRoundtable
} from '../../../api/stock';
import { conclusionColor } from '../useRoundtableFlow';

interface Props {
  onReplay: (id: number) => void;
  refreshKey: number;
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  completed: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' },
  preparing: { color: 'processing', label: '准备中' },
  round1: { color: 'processing', label: '独立分析中' },
  debating: { color: 'processing', label: '辩论中' },
  summarizing: { color: 'processing', label: '总结中' }
};

const MODE_LABEL: Record<string, string> = {
  quick: '快速',
  standard: '标准',
  deep: '深度'
};

export const HistoryTable: React.FC<Props> = ({ onReplay, refreshKey }) => {
  const [items, setItems] = useState<RoundtableListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listRoundtables(page, pageSize);
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载会议记录失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleRemove = async (id: number) => {
    try {
      await removeRoundtable(id);
      message.success('已删除');
      void load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const columns = [
    { title: '分析对象', dataIndex: 'subjectName', key: 'subjectName' },
    {
      title: '类型',
      dataIndex: 'subjectType',
      key: 'subjectType',
      width: 80,
      render: (value: string) =>
        ({ market: '大盘', index: '指数', sector: '板块', stock: '个股' } as Record<string, string>)[value] ?? value
    },
    {
      title: '会议结论',
      key: 'conclusion',
      width: 140,
      render: (_: unknown, record: RoundtableListItem) =>
        record.consensus ? (
          <span className="flex items-center gap-1">
            <span style={{ color: conclusionColor(record.consensus.conclusion), fontWeight: 600 }}>
              {record.consensus.conclusionLabel}
            </span>
            {record.consensus.engine?.degraded && <Tag color="warning">规则</Tag>}
          </span>
        ) : (
          <span className="text-text-sub">—</span>
        )
    },
    {
      title: '投票',
      key: 'votes',
      width: 150,
      render: (_: unknown, record: RoundtableListItem) => {
        const votes = record.consensus?.votes;
        if (!votes) {
          return <span className="text-text-sub">—</span>;
        }
        return (
          <span className="text-xs">
            <span style={{ color: '#f5222d' }}>多{votes.bull}</span>
            <span className="text-text-sub"> / </span>
            <span style={{ color: '#16a34a' }}>空{votes.bear}</span>
            <span className="text-text-sub"> / 中{votes.neutral}</span>
          </span>
        );
      }
    },
    { title: '模式', dataIndex: 'mode', key: 'mode', width: 70, render: (value: string) => MODE_LABEL[value] ?? value },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: string) => <Tag color={STATUS_TAG[value]?.color ?? 'default'}>{STATUS_TAG[value]?.label ?? value}</Tag>
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: string) => new Date(value).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_: unknown, record: RoundtableListItem) => (
        <span className="flex gap-1">
          <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => onReplay(record.id)}>
            回放
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemove(record.id)}>
            删除
          </Button>
        </span>
      )
    }
  ];

  return (
    <Card
      title="会议记录"
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
      }
    >
      <AppTable
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          }
        }}
      />
    </Card>
  );
};
