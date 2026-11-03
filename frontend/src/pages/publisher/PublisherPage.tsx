// 发布矩阵页：四 Tab（平台账号管理 / 发布记录 / 数据回流 / 敏感词库）。账号 CRUD + 手动登记发布结果 + 平台按日数据 CSV 导入。
// 凭据安全：编辑时不传 credentials = 不修改；响应面只有 credentialMask 脱敏掩码。
// 数据回流：明细全量拉取后前端聚合汇总卡；爆款标记用 utils/metrics.ts 与后端同口径纯函数。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import DatePicker from 'antd/es/date-picker';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Switch from 'antd/es/switch';
import Tabs from 'antd/es/tabs';
import Tag from 'antd/es/tag';
import Upload from 'antd/es/upload';
import { DownloadOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  PUBLISHER_PLATFORMS,
  PUBLISHER_PLATFORM_LABELS,
  PublisherAccountVo,
  VideoPublishRecordVo,
  MetricRejectedRow,
  PlatformMetricVo,
  createPublisherAccount,
  deletePublisherAccount,
  deletePublisherRecord,
  downloadMetricsTemplate,
  importPlatformMetrics,
  listPlatformMetrics,
  listPublisherAccounts,
  listPublisherRecords,
  updatePublisherAccount,
  type PublisherPlatform,
  type SavePublisherAccountPayload
} from '../../api/publisher';
import { NovelProjectSummary, listNovelProjects } from '../../api/novelVideo';
import { aggregateMetrics, engagementRate, isHot } from '../../utils/metrics';
import { PageHeader } from '../../components/business/PageHeader';
import { FilterBar } from '../../components/business/FilterBar';
import { StatCard } from '../../components/business/StatCard';
import { SelfTable } from '../../components/base/SelfTable';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { useApiMessage } from '../../hooks/useApiMessage';
import { useAppSelector } from '../../store/hooks';
import { Permission } from '../../components/permission/Permission';
import { ComplianceWordsTab } from './ComplianceWordsTab';

const PLATFORM_OPTIONS = PUBLISHER_PLATFORMS.map((value) => ({ value, label: PUBLISHER_PLATFORM_LABELS[value] }));

const platformLabel = (platform: string) => PUBLISHER_PLATFORM_LABELS[platform as PublisherPlatform] ?? platform;

interface AccountFormValues {
  platform: PublisherPlatform;
  accountName: string;
  credentials?: string;
  status: boolean;
  remark?: string;
}

// 账号新建/编辑双模式弹窗：编辑时凭据占位「不修改请留空」，不传 credentials 即不改密文。
const AccountModal: React.FC<{
  open: boolean;
  account: PublisherAccountVo | null;
  onCancel: () => void;
  onSaved: () => void;
}> = ({ open, account, onCancel, onSaved }) => {
  const [form] = Form.useForm<AccountFormValues>();
  const msg = useApiMessage();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      platform: account?.platform ?? 'douyin',
      accountName: account?.accountName ?? '',
      credentials: undefined,
      status: (account?.status ?? 1) === 1,
      remark: account?.remark ?? ''
    });
  }, [open, account, form]);

  const submit = async (values: AccountFormValues) => {
    setSaving(true);
    try {
      const payload: SavePublisherAccountPayload = {
        platform: values.platform,
        accountName: values.accountName.trim(),
        status: values.status ? 1 : 0,
        remark: values.remark?.trim() || undefined
      };
      // 编辑且未填写凭据：不带 credentials 字段 = 不修改密文
      if (values.credentials?.trim()) {
        payload.credentials = values.credentials.trim();
      }
      if (account) {
        await updatePublisherAccount(account.id, payload);
      } else {
        await createPublisherAccount(payload);
      }
      msg.success(account ? '账号已更新' : '账号已创建');
      onSaved();
      onCancel();
    } catch (error) {
      msg.errorFrom(error, '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SelfModal
      open={open}
      title={account ? '编辑平台账号' : '新建平台账号'}
      onCancel={onCancel}
      onOk={() => void form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      <SelfForm form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
          <Select options={PLATFORM_OPTIONS} placeholder="请选择平台" />
        </Form.Item>
        <Form.Item
          name="accountName"
          label="账号名"
          rules={[{ required: true, message: '请输入账号名' }, { max: 128, message: '最长 128 字符' }]}
        >
          <Input placeholder="平台账号名/昵称" maxLength={128} />
        </Form.Item>
        <Form.Item
          name="credentials"
          label="凭据（Cookie/Token）"
          extra={account ? '编辑时留空 = 不修改凭据' : '用于后续自动发布通道，manual 登记可不填'}
        >
          <Input.TextArea rows={3} placeholder="平台凭据（加密存储，仅用于后续自动化发布）" maxLength={2000} />
        </Form.Item>
        <Form.Item name="status" label="状态" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={255} placeholder="备注（可选）" />
        </Form.Item>
      </SelfForm>
    </SelfModal>
  );
};

interface MetricsFilterValues {
  projectId?: number;
  platform?: PublisherPlatform;
  range?: [Dayjs, Dayjs];
}

// 数据回流 Tab：独立数据加载（懒挂载——antd Tabs 未激活 pane 不渲染 children，首切才拉取，不拖慢前两 Tab）。
// 明细全量拉取后前端聚合四张汇总卡；爆款标记 isHot 与后端 hot-metrics.util 同口径（阈值常量见 utils/metrics.ts）。
const MetricsTab: React.FC = () => {
  const msg = useApiMessage();
  const [form] = Form.useForm<MetricsFilterValues>();
  const [metrics, setMetrics] = useState<PlatformMetricVo[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rejectedRows, setRejectedRows] = useState<MetricRejectedRow[]>([]);
  const [projects, setProjects] = useState<NovelProjectSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      setMetrics(
        await listPlatformMetrics({
          projectId: values.projectId,
          platform: values.platform,
          from: values.range?.[0]?.format('YYYY-MM-DD'),
          to: values.range?.[1]?.format('YYYY-MM-DD')
        })
      );
    } catch (error) {
      msg.errorFrom(error, '数据回流加载失败');
    } finally {
      setLoading(false);
    }
  }, [form, msg]);

  useEffect(() => {
    void listNovelProjects()
      .then(setProjects)
      .catch(() => undefined);
    void load();
  }, [load]);

  // Upload beforeUpload 返回 false 阻断 antd 自动上传，手动 FormData 走 JSON envelope 封装
  const handleImport = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const formData = new FormData();
        formData.append('file', file, file.name);
        const result = await importPlatformMetrics(formData);
        msg.success(`导入完成：新增 ${result.inserted}，覆盖 ${result.updated}，拒绝 ${result.rejected.length}`);
        if (result.rejected.length > 0) {
          setRejectedRows(result.rejected);
        }
        await load();
      } catch (error) {
        msg.errorFrom(error, '导入失败');
      } finally {
        setImporting(false);
      }
    },
    [load, msg]
  );

  // 模板下载失败兜底：downloadMetricsTemplate 内部裸 axios 无 try/catch，token 过期/网络错误时
  // promise reject——不接住会成 unhandled rejection，用户点了没反应（与 handleImport 错误处理对齐）
  const handleDownloadTemplate = useCallback(async () => {
    try {
      await downloadMetricsTemplate();
    } catch (error) {
      msg.errorFrom(error, '模板下载失败');
    }
  }, [msg]);

  const summary = useMemo(() => aggregateMetrics(metrics), [metrics]);

  const metricColumns = useMemo(
    () => [
      {
        title: '日期',
        dataIndex: 'metricDate',
        key: 'metricDate',
        width: 110,
        render: (v: string) => dayjs(v).format('YYYY-MM-DD')
      },
      { title: '平台', dataIndex: 'platform', key: 'platform', width: 90, render: (v: string) => platformLabel(v) },
      { title: '作品', dataIndex: 'projectName', key: 'projectName', ellipsis: true },
      { title: '视频 ID', dataIndex: 'videoId', key: 'videoId', ellipsis: true, render: (v: string) => v || '-' },
      { title: '播放', dataIndex: 'views', key: 'views', width: 100 },
      { title: '点赞', dataIndex: 'likes', key: 'likes', width: 90 },
      { title: '评论', dataIndex: 'comments', key: 'comments', width: 90 },
      { title: '涨粉', dataIndex: 'follows', key: 'follows', width: 90 },
      {
        title: '互动率',
        key: 'engagement',
        width: 100,
        render: (_: unknown, row: PlatformMetricVo) => `${(engagementRate(row.likes, row.views) * 100).toFixed(1)}%`
      },
      {
        title: '爆款',
        key: 'isHot',
        width: 80,
        render: (_: unknown, row: PlatformMetricVo) =>
          isHot(row.views, row.likes) ? <Tag color="volcano">爆款</Tag> : '-'
      }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-3">
      <FilterBar<MetricsFilterValues> form={form} onSearch={() => void load()} searchLoading={loading}>
        <Form.Item name="projectId" label="作品">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部作品"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            className="w-full sm:w-[200px]"
          />
        </Form.Item>
        <Form.Item name="platform" label="平台">
          <Select allowClear placeholder="全部平台" options={PLATFORM_OPTIONS} className="w-full sm:w-[140px]" />
        </Form.Item>
        <Form.Item name="range" label="日期范围">
          <DatePicker.RangePicker allowClear />
        </Form.Item>
      </FilterBar>
      <div className="flex items-center gap-2">
        <Button icon={<DownloadOutlined />} onClick={() => void handleDownloadTemplate()}>
          下载模板
        </Button>
        <Permission code="publisher:manage">
          <Upload
            accept=".csv"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleImport(file);
              return false;
            }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={importing}>
              导入 CSV
            </Button>
          </Upload>
        </Permission>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="总播放" value={summary.views} loading={loading} />
        <StatCard title="总点赞" value={summary.likes} loading={loading} />
        <StatCard title="总评论" value={summary.comments} loading={loading} />
        <StatCard title="总涨粉" value={summary.follows} loading={loading} />
      </div>
      <SelfTable
        rowKey="id"
        loading={loading}
        columns={metricColumns}
        dataSource={metrics}
        pagination={metrics.length > 20 ? { pageSize: 20 } : false}
      />
      <SelfModal
        open={rejectedRows.length > 0}
        title="导入拒绝明细"
        width="md"
        footer={null}
        onCancel={() => setRejectedRows([])}
      >
        <SelfTable
          rowKey={(row) => `${row.line}-${row.reason}`}
          columns={[
            { title: '行号', dataIndex: 'line', key: 'line', width: 80 },
            { title: '拒绝原因', dataIndex: 'reason', key: 'reason' }
          ]}
          dataSource={rejectedRows.slice(0, 20)}
          pagination={false}
        />
        {rejectedRows.length > 20 && <p className="mt-2 text-gray-500">仅展示前 20 条，共 {rejectedRows.length} 条</p>}
      </SelfModal>
    </div>
  );
};

export const PublisherPage: React.FC = () => {
  const msg = useApiMessage();
  // 敏感词库 Tab 条目级授权（UI 契约 §3）：本页此前无读 store 先例，此处为全新引入——
  // 仅当含 compliance:view 时才把该 Tab 加入 items，无码用户整条 Tab 不渲染（非「点开空白」）
  const permissions = useAppSelector((state) => state.auth.profile?.permissions ?? []);
  const [accounts, setAccounts] = useState<PublisherAccountVo[]>([]);
  const [records, setRecords] = useState<VideoPublishRecordVo[]>([]);
  const [loading, setLoading] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PublisherAccountVo | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [accountList, recordList] = await Promise.all([listPublisherAccounts(), listPublisherRecords({})]);
      setAccounts(accountList);
      setRecords(recordList.items);
    } catch (error) {
      msg.errorFrom(error, '发布矩阵数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const removeAccount = useCallback(
    async (account: PublisherAccountVo) => {
      try {
        await deletePublisherAccount(account.id);
        msg.success('账号已删除');
        await loadAll();
      } catch (error) {
        msg.errorFrom(error, '删除失败（被发布记录引用的账号不可删除）');
      }
    },
    [msg]
  );

  const removeRecord = useCallback(
    async (record: VideoPublishRecordVo) => {
      try {
        await deletePublisherRecord(record.id);
        msg.success('发布记录已删除');
        await loadAll();
      } catch (error) {
        msg.errorFrom(error, '删除失败');
      }
    },
    [msg]
  );

  const accountColumns = useMemo(
    () => [
      { title: '平台', dataIndex: 'platform', key: 'platform', render: (v: string) => platformLabel(v) },
      { title: '账号名', dataIndex: 'accountName', key: 'accountName' },
      { title: '凭据', dataIndex: 'credentialMask', key: 'credentialMask', render: (v: string | null) => v ?? '未配置' },
      { title: '状态', dataIndex: 'status', key: 'status', render: (v: number) => (v === 1 ? '启用' : '停用') },
      { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
      {
        title: '操作',
        key: 'actions',
        render: (_: unknown, row: PublisherAccountVo) => (
          <Button size="small" type="link" onClick={() => setEditingAccount(row)}>
            编辑
          </Button>
        )
      }
    ],
    []
  );

  const recordColumns = useMemo(
    () => [
      { title: '作品', dataIndex: 'projectName', key: 'projectName', ellipsis: true },
      { title: '平台', dataIndex: 'platform', key: 'platform', render: (v: string) => platformLabel(v) },
      { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
      { title: '发布时间', dataIndex: 'publishedAt', key: 'publishedAt', width: 180 },
      {
        title: '回执',
        dataIndex: 'receiptUrl',
        key: 'receiptUrl',
        render: (v: string | null) =>
          v ? (
            <a href={v} target="_blank" rel="noreferrer">
              查看回执
            </a>
          ) : (
            '-'
          )
      },
      {
        title: '操作',
        key: 'actions',
        render: (_: unknown, row: VideoPublishRecordVo) => (
          <Permission code="publisher:manage">
            <Button size="small" type="link" onClick={() => void removeRecord(row)}>
              删除
            </Button>
          </Permission>
        )
      }
    ],
    []
  );

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="发布矩阵"
        subtitle="平台账号管理、发布记录登记与平台数据回流（CSV 导入）；后续平台 API 通道上线后可一键分发。"
        actions={
          <Permission code="publisher:manage">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingAccount(null);
                setAccountModalOpen(true);
              }}
            >
              新建平台账号
            </Button>
          </Permission>
        }
      />
      <Tabs
        items={[
          {
            key: 'accounts',
            label: '平台账号',
            children: (
              <SelfTable
                rowKey="id"
                loading={loading}
                columns={accountColumns}
                dataSource={accounts}
                pagination={accounts.length > 20 ? { pageSize: 20 } : false}
              />
            )
          },
          {
            key: 'records',
            label: '发布记录',
            children: (
              <SelfTable
                rowKey="id"
                loading={loading}
                columns={recordColumns}
                dataSource={records}
                pagination={records.length > 20 ? { pageSize: 20 } : false}
              />
            )
          },
          {
            key: 'metrics',
            label: '数据回流',
            children: <MetricsTab />
          },
          // 词库是发布矩阵页内 Tab 不是新路由（页面资源 /publisher 已存在，无 resource seed 变更）；
          // ComplianceWordsTab 懒挂载：antd Tabs 未激活 pane 不渲染 children，首切才拉数据
          ...(permissions.includes('compliance:view')
            ? [{ key: 'words', label: '敏感词库', children: <ComplianceWordsTab /> }]
            : [])
        ]}
      />
      <AccountModal
        open={accountModalOpen}
        account={editingAccount}
        onCancel={() => setAccountModalOpen(false)}
        onSaved={() => void loadAll()}
      />
    </div>
  );
};
