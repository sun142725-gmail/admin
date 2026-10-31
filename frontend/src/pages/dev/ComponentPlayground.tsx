// 开发专用演示页（dev-only，不进侧边菜单）：基座组件与 hooks 用法总览。
// 本地 mock 数据，零接口调用；仅演示组件组合，不含任何业务逻辑。
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Progress,
  Select,
  Space,
  Tag,
  Typography
} from 'antd';
import { PageHeader } from '../../components/business/PageHeader';
import { PagePanel, EmptyState } from '../../components/business/PagePanel';
import { FilterBar } from '../../components/business/FilterBar';
import { SelfTable } from '../../components/base/SelfTable';
import { SelfForm, validateFormValues } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfDrawer } from '../../components/base/SelfDrawer';
import { StatusTag } from '../../components/business/StatusTag';
import { ActionCell } from '../../components/business/ActionCell';
import { ConfirmPopconfirm, confirmAction } from '../../components/business/ConfirmAction';
import { StatCard } from '../../components/business/StatCard';
import {
  classifyMedia,
  OutputsMediaPreview,
  MediaPreview
} from '../../components/business/MediaPreview';
import { useApiMessage } from '../../hooks/useApiMessage';
import { useTableQuery } from '../../hooks/useTableQuery';
import type { TableQueryFetchParams } from '../../hooks/useTableQuery';
import { useFormModal } from '../../hooks/useFormModal';
import { useColumnSettings } from '../../hooks/useColumnSettings';
import type { ColumnVisibilityStore } from '../../hooks/useColumnSettings';
import { ColumnSettings } from '../../components/ColumnSettings';
import { SPACE_SIZE } from '../../types/ui';
import type { StatusMeta } from '../../types/ui';
import { getErrorMessage } from '../../utils/errorMessage';

// —— mock 数据（零接口调用）——

interface MockRow {
  id: number;
  name: string;
  status: string;
}

const MOCK_ROWS: MockRow[] = Array.from({ length: 35 }, (_, index) => ({
  id: index + 1,
  name: `演示条目 ${index + 1}`,
  status: ['pending', 'running', 'succeeded', 'failed'][index % 4]
}));

const DEMO_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '排队中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  succeeded: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' }
};

const fetchMockRows = async ({
  page,
  pageSize,
  filters
}: TableQueryFetchParams<{ keyword?: string }>): Promise<{ items: MockRow[]; total: number }> => {
  const keyword = filters.keyword ?? '';
  const rows = MOCK_ROWS.filter((row) => !keyword || row.name.includes(keyword));
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length
  };
};

// 内存 storage：演示 useColumnSettings 注入式设计（不污染真实 localStorage）
const createMemoryStore = (): ColumnVisibilityStore => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
};

// 1×1 占位图（无网络资源；真实图片/视频由 flow/graphic 接口下发）
const DEMO_IMAGE_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const DEMO_OUTPUTS: Record<string, unknown> = {
  video: '/uploads/demo/demo.mp4',
  audio: '/uploads/demo/demo.mp3',
  image: DEMO_IMAGE_URL,
  model: 'demo-model',
  tokens: 1024,
  detail: { steps: 3, seed: 42 }
};

const columns = [
  { title: 'ID', dataIndex: 'id', width: 80 },
  { title: '名称', dataIndex: 'name' },
  {
    title: '状态',
    dataIndex: 'status',
    render: (value: string) => <StatusTag value={value} map={DEMO_STATUS_META} />
  }
];

export const ComponentPlayground: React.FC = () => {
  const msg = useApiMessage();
  const [queryForm] = Form.useForm<{ keyword?: string }>();
  const [demoForm] = Form.useForm<{ name: string; level: string }>();
  const modal = useFormModal<{ name: string; level: string }>(demoForm);
  const [detailOpen, setDetailOpen] = useState(false);
  const columnSettings = useColumnSettings({
    tab: 'dev_playground',
    defaults: ['id', 'name', 'status'],
    store: useMemo(createMemoryStore, [])
  });

  const table = useTableQuery<MockRow, { keyword?: string }>({ fetcher: fetchMockRows });

  const submitDemoForm = async () => {
    const values = await validateFormValues(demoForm);
    if (!values) {
      return;
    }
    msg.success(`校验通过：${values.name} / ${values.level}`);
    modal.close();
  };

  const onDemoSearch = () => {
    void queryForm
      .validateFields()
      .then((values) => {
        table.search({ keyword: values.keyword });
        msg.info('演示：FilterBar 查询回调（useTableQuery.search 已回第 1 页）');
      })
      .catch(() => {
        // 校验不通过：antd 已在控件上标红，无需额外提示
      });
  };

  const onDemoReset = () => {
    queryForm.resetFields();
    table.reset();
    msg.info('演示：FilterBar 重置回调');
  };

  return (
    <div>
      <Alert
        className="mb-4"
        type="info"
        showIcon
        message="开发专用演示页（dev-only）"
        description="基座组件与 hooks 真实用法总览：本地 mock 数据、零接口调用、不进侧边菜单。迁移指引见 frontend/src/components/README.md。"
      />

      <Card title="1. PageHeader / PagePanel（标题区 + 内容容器）" className="mb-4">
        <PageHeader title="演示标题" subtitle="page-toolbar / page-toolbar-title / page-toolbar-subtitle / page-actions 类由组件承载" actions={<Button type="primary">新增</Button>} />
        <PagePanel>
          <div style={{ padding: 16 }}>
            <Typography.Text>page-table-card 容器内放 SelfTable（见第 3 节）。</Typography.Text>
          </div>
        </PagePanel>
      </Card>

      <Card title="2. FilterBar（筛选栏）" className="mb-4">
        <FilterBar form={queryForm} onSearch={onDemoSearch} onReset={onDemoReset}>
          <Form.Item label="关键词" name="keyword">
            <Input placeholder="演示控件" allowClear />
          </Form.Item>
          <Form.Item label="状态" name="level">
            <Select
              placeholder="演示控件"
              allowClear
              style={{ minWidth: 120 }}
              options={[
                { value: 'info', label: 'info' },
                { value: 'warn', label: 'warn' }
              ]}
            />
          </Form.Item>
        </FilterBar>
      </Card>

      <Card title="3. SelfTable + useTableQuery（列表样板）" className="mb-4">
        <PagePanel>
          <SelfTable
            rowKey="id"
            columns={columns}
            dataSource={table.data}
            loading={table.loading}
            pagination={table.pagination}
          />
        </PagePanel>
      </Card>

      <Card title="4. SelfForm + useFormModal + SelfModal（表单弹窗）" className="mb-4">
        <Space wrap size={SPACE_SIZE.sm}>
          <Button type="primary" onClick={() => modal.openForm()}>
            新建（openForm()）
          </Button>
          <Button onClick={() => modal.openForm({ name: '预填名称', level: 'info' })}>
            编辑（openForm(record)：reset→setFieldsValue→open）
          </Button>
          <Button onClick={() => setDetailOpen(true)}>详情态弹窗（footer=null, width="lg"）</Button>
        </Space>
        <SelfModal
          title={modal.editing ? '编辑演示' : '新建演示'}
          open={modal.open}
          onOk={submitDemoForm}
          onCancel={modal.close}
          okText="保存"
        >
          <SelfForm form={demoForm} layout="vertical">
            <Form.Item label="名称" name="name" rules={[{ required: true, message: '请填写名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="级别" name="level" rules={[{ required: true, message: '请选择级别' }]}>
              <Select options={[{ value: 'info', label: 'info' }, { value: 'warn', label: 'warn' }]} />
            </Form.Item>
          </SelfForm>
        </SelfModal>
        <SelfModal title="详情态（footer=null）" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width="lg">
          <Typography.Text>详情态弹窗：footer=null、width 档位 lg=720。</Typography.Text>
        </SelfModal>
      </Card>

      <Card title="5. SelfDrawer（宽度档位 sm=480/md=560/lg=720，maxWidth 80vw）" className="mb-4">
        <DrawerDemo msg={msg} />
      </Card>

      <Card title="6. StatusTag（状态标签）" className="mb-4">
        <Space wrap size={SPACE_SIZE.sm}>
          {Object.entries(DEMO_STATUS_META).map(([value, meta]) => (
            <StatusTag key={value} value={value} map={DEMO_STATUS_META} />
          ))}
          <StatusTag value="unknown" map={DEMO_STATUS_META} fallback={{ label: '未知', color: 'default' }} />
          <StatusTag value="no-match" map={DEMO_STATUS_META} />
        </Space>
        <Typography.Paragraph type="secondary" className="!mb-0 mt-2">
          第三枚：map 未命中走 fallback；第四枚：无 fallback 退化为原值无色 Tag（resolveStatusMeta 纯函数可测）。
        </Typography.Paragraph>
      </Card>

      <Card title="7. ActionCell（操作列，Permission 组合）" className="mb-4">
        <ActionCell
          record={{ id: 1, name: '演示条目 1', status: 'running' }}
          items={[
            { key: 'edit', label: '编辑', onClick: (row: MockRow) => msg.info(`演示：编辑 ${row.name}`) },
            { key: 'del', label: '删除', danger: true, permission: 'dev:demo:delete', onClick: () => msg.info('演示：删除') }
          ]}
        />
        <Typography.Paragraph type="secondary" className="!mb-0 mt-2">
          默认 variant='link' size='small'；permission 传入时包 Permission（mode=disable，无权限置灰）。
        </Typography.Paragraph>
      </Card>

      <Card title="8. ConfirmAction（二段确认）" className="mb-4">
        <Space wrap size={SPACE_SIZE.sm}>
          <ConfirmPopconfirm title="确认执行演示操作？" onConfirm={() => msg.success('已确认（Popconfirm）')}>
            <Button>ConfirmPopconfirm（okText 不设默认）</Button>
          </ConfirmPopconfirm>
          <ConfirmPopconfirm title="确认删除？" okText="删除" onConfirm={() => msg.success('已确认（显式 okText=删除）')}>
            <Button danger>显式 okText='删除'（对齐 FlowsPage/NovelVideoPage 现状）</Button>
          </ConfirmPopconfirm>
          <Button
            danger
            onClick={() =>
              confirmAction({
                title: '删除演示数据',
                content: 'confirmAction + buildConfirmOptions（danger:true → okButtonProps.danger）',
                danger: true,
                onOk: async () => {
                  msg.success('已确认（Modal.confirm）');
                }
              })
            }
          >
            confirmAction（Modal.confirm）
          </Button>
        </Space>
      </Card>

      <Card title="9. StatCard（统计卡，children 承载 Progress 纵排）" className="mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <StatCard title="CPU 使用率" value={38.5} suffix="%" precision={2} loading={false}>
            <Progress className="mt-3" percent={38.5} showInfo={false} />
          </StatCard>
          <StatCard title="内存使用率" value={62} suffix="%" precision={2} tip="children/extra 插槽演示">
            <Progress className="mt-3" percent={62} showInfo={false} />
          </StatCard>
          <StatCard title="任务总数" value={128} extra={<Tag color="processing">进行中</Tag>} />
        </div>
      </Card>

      <Card title="10. MediaPreview（媒体预览 + JSON 折叠）" className="mb-4">
        <Space direction="vertical" size={SPACE_SIZE.md} style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>classifyMedia 判定：</Typography.Text>
            <Space wrap size={SPACE_SIZE.xs} className="mt-1">
              {['/uploads/a.mp4', '/uploads/a.png', '/uploads/a.mp3', '/uploads/a.txt'].map((url) => (
                <Tag key={url}>{`${url} → ${classifyMedia(url) ?? 'null'}`}</Tag>
              ))}
            </Space>
          </div>
          <div>
            <Typography.Text strong>OutputsMediaPreview（媒体直渲 + 其余 JSON 折叠，复用 JsonView）：</Typography.Text>
            <div className="mt-1">
              <OutputsMediaPreview outputs={DEMO_OUTPUTS} />
            </div>
          </div>
          <div>
            <Typography.Text strong>MediaPreview 单 URL（占位图 data URL）：</Typography.Text>
            <div className="mt-1">
              <MediaPreview url={DEMO_IMAGE_URL} alt="占位图" mediaWidth={120} />
            </div>
          </div>
        </Space>
      </Card>

      <Card title="11. useApiMessage（统一消息）" className="mb-4">
        <Space wrap size={SPACE_SIZE.sm}>
          <Button onClick={() => msg.success('成功文案')}>success</Button>
          <Button onClick={() => msg.error('失败文案')}>error</Button>
          <Button onClick={() => msg.errorFrom(new Error('接口异常'), '兜底文案')}>errorFrom</Button>
          <Button onClick={() => msg.warning('警告文案')}>warning</Button>
          <Button onClick={() => msg.info('信息文案')}>info</Button>
          <Button onClick={() => msg.loading('加载文案')}>loading</Button>
        </Space>
        <Typography.Paragraph type="secondary" className="!mb-0 mt-2">
          getErrorMessage 纯函数演示：{getErrorMessage({ response: { data: { message: 'response.data.message' } } }, 'fallback')}
        </Typography.Paragraph>
      </Card>

      <Card title="12. useColumnSettings + ColumnSettings（列可见性记忆）" className="mb-4">
        <Space direction="vertical" size={SPACE_SIZE.sm}>
          <ColumnSettings
            options={[
              { key: 'id', label: 'ID' },
              { key: 'name', label: '名称' },
              { key: 'status', label: '状态' },
              { key: 'extra', label: '扩展列' }
            ]}
            visible={columnSettings.visible}
            onChange={columnSettings.change}
            onReset={columnSettings.reset}
          />
          <Typography.Text type="secondary">
            存储键 {columnSettings.storageKey}（内存 store 注入），当前可见：{columnSettings.visible.join(' / ') || '（空）'}
          </Typography.Text>
        </Space>
      </Card>

      <Card title="13. Space 间距四档（SPACE_SIZE：xs4/sm8/md12/lg16）" className="mb-4">
        {(['xs', 'sm', 'md', 'lg'] as const).map((scale) => (
          <div key={scale} className="mb-2">
            <Tag>{scale}</Tag>
            <Space size={SPACE_SIZE[scale]}>
              <Button size="small">甲</Button>
              <Button size="small">乙</Button>
              <Button size="small">丙</Button>
            </Space>
          </div>
        ))}
      </Card>

      <Card title="14. EmptyState（非表格空态）" className="mb-4">
        <EmptyState description="自定义空态文案：详情/页面级空态走这里，表格空态一律走 Table locale.emptyText" />
      </Card>
    </div>
  );
};

// 抽屉演示子组件（避免主组件 hook 数量膨胀）
const DrawerDemo: React.FC<{ msg: ReturnType<typeof useApiMessage> }> = ({ msg }) => {
  const [width, setWidth] = useState<'sm' | 'md' | 'lg' | '66vw'>('md');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Space wrap size={SPACE_SIZE.sm}>
        {(['sm', 'md', 'lg', '66vw'] as const).map((scale) => (
          <Button key={scale} type={scale === width ? 'primary' : 'default'} onClick={() => setWidth(scale)}>
            width="{scale}"
          </Button>
        ))}
        <Button type="primary" onClick={() => setOpen(true)}>
          打开抽屉
        </Button>
      </Space>
      <SelfDrawer
        title={`SelfDrawer（width="${width}"）`}
        open={open}
        onClose={() => {
          setOpen(false);
          msg.info('演示：抽屉关闭');
        }}
        width={width}
      >
        <Typography.Text>
          默认 className=app-form-drawer；extra 操作区、number|string 宽度透传保留（'66vw' 为已知特例）。
        </Typography.Text>
      </SelfDrawer>
    </>
  );
};
