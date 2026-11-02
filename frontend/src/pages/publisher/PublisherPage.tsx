// 发布矩阵页：双 Tab（平台账号管理 / 发布记录）。账号 CRUD + 手动登记发布结果。
// 凭据安全：编辑时不传 credentials = 不修改；响应面只有 credentialMask 脱敏掩码。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Switch from 'antd/es/switch';
import Tabs from 'antd/es/tabs';
import { PlusOutlined } from '@ant-design/icons';
import {
  PUBLISHER_PLATFORMS,
  PUBLISHER_PLATFORM_LABELS,
  PublisherAccountVo,
  VideoPublishRecordVo,
  createPublisherAccount,
  deletePublisherAccount,
  deletePublisherRecord,
  listPublisherAccounts,
  listPublisherRecords,
  updatePublisherAccount,
  type PublisherPlatform,
  type SavePublisherAccountPayload
} from '../../api/publisher';
import { PageHeader } from '../../components/business/PageHeader';
import { SelfTable } from '../../components/base/SelfTable';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { useApiMessage } from '../../hooks/useApiMessage';
import { Permission } from '../../components/permission/Permission';

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

export const PublisherPage: React.FC = () => {
  const msg = useApiMessage();
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
        subtitle="平台账号管理与发布记录登记；后续平台 API 通道上线后可一键分发。"
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
          }
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
