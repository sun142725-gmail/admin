import React, { useEffect, useState } from 'react';
import { Button, Modal, Select, Space, Tag, Typography, message } from 'antd';
import { AppTable } from '../../components/AppTable';
import { Permission } from '../../components/permission/Permission';
import { listNotificationInbox, readAllNotificationInbox, readNotificationInbox } from '../../api/notification';

interface InboxItem {
  id: number;
  title: string;
  content: string;
  status: 'unread' | 'read';
  readAt?: string;
  createdAt?: string;
  publish?: {
    id: number;
    channelType: string;
    template?: {
      id: number;
      name: string;
    };
  };
}

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '未读', value: 'unread' },
  { label: '已读', value: 'read' }
];

export const InboxPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InboxItem[]>([]);
  const [status, setStatus] = useState('');
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchData = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const res = await listNotificationInbox({
        page: nextPage,
        pageSize: nextPageSize,
        status: status ? (status as 'read' | 'unread') : undefined
      });
      setData(res.items ?? []);
      setTotal(res.total ?? 0);
      setUnreadCount(res.unreadCount ?? 0);
      setPage(nextPage);
      setPageSize(nextPageSize);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1, pageSize);
  }, [status]);

  const onOpenDetail = async (item: InboxItem) => {
    setSelectedItem(item);
    if (item.status === 'unread') {
      await readNotificationInbox(item.id);
      fetchData();
    }
  };

  const onReadAll = async () => {
    await readAllNotificationInbox();
    message.success('已全部标记为已读');
    fetchData(1, pageSize);
  };

  const onReadSingle = async (id: number) => {
    await readNotificationInbox(id);
    fetchData();
  };

  const columns = [
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) =>
        value === 'unread' ? <Tag color="red">未读</Tag> : <Tag color="green">已读</Tag>
    },
    { title: '标题', dataIndex: 'title' },
    { title: '模板', dataIndex: ['publish', 'template', 'name'], width: 180 },
    {
      title: '发送时间',
      dataIndex: 'createdAt',
      width: 180
    },
    {
      title: '操作',
      width: 160,
      render: (_: unknown, item: InboxItem) => (
        <Space>
          <Button size="small" onClick={() => onOpenDetail(item)}>
            查看
          </Button>
          <Permission code="system:notification:inbox:read" mode="disable">
            <Button size="small" disabled={item.status === 'read'} onClick={() => onReadSingle(item.id)}>
              标记已读
            </Button>
          </Permission>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          style={{ width: 140 }}
          placeholder="筛选状态"
        />
        <Tag color="red">未读 {unreadCount}</Tag>
        <Permission code="system:notification:inbox:read" mode="disable">
          <Button onClick={onReadAll}>全部已读</Button>
        </Permission>
      </Space>

      <AppTable
        rowKey="id"
        columns={columns}
        loading={loading}
        dataSource={data}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 30, 50],
          showTotal: (value) => `共 ${value} 条`
        }}
        onChange={(pagination) => {
          fetchData(pagination.current, pagination.pageSize);
        }}
      />

      <Modal title={selectedItem?.title ?? '站内信详情'} open={!!selectedItem} footer={null} onCancel={() => setSelectedItem(null)} width={760}>
        <Typography.Paragraph type="secondary">
          模板：{selectedItem?.publish?.template?.name ?? '-'} | 消息ID：{selectedItem?.id ?? '-'}
        </Typography.Paragraph>
        <div dangerouslySetInnerHTML={{ __html: selectedItem?.content ?? '' }} />
      </Modal>
    </div>
  );
};
