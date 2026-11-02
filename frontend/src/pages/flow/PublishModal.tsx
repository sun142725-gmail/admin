// 成片发布弹窗（手动登记）：平台/账号联动 + 标题 + 发布时间 + 回执链接 + 备注。
// 账号列表加载失败（含仅授 manage 无 view 的 403）静默降级：平台退化为静态六项、账号可空
// （评审修正④：仅授 manage 无 view 的角色仍能完成手动登记）。
import { useEffect, useState } from 'react';
import DatePicker from 'antd/es/date-picker';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import dayjs, { type Dayjs } from 'dayjs';
import {
  PUBLISHER_PLATFORMS,
  PUBLISHER_PLATFORM_LABELS,
  PublisherAccountVo,
  createPublisherRecord,
  listPublisherAccounts,
  type PublisherPlatform
} from '../../api/publisher';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { useApiMessage } from '../../hooks/useApiMessage';

export interface PublishModalProps {
  open: boolean;
  projectId: number;
  onClose: () => void;
  onRegistered: () => void;
  onError: (error: unknown) => void;
}

interface PublishFormValues {
  platform: PublisherPlatform;
  accountId?: number;
  title?: string;
  range: [Dayjs, Dayjs] | null;
  receiptUrl?: string;
  note?: string;
}

const PLATFORM_OPTIONS = PUBLISHER_PLATFORMS.map((value) => ({ value, label: PUBLISHER_PLATFORM_LABELS[value] }));

export const PublishModal: React.FC<PublishModalProps> = ({ open, projectId, onClose, onRegistered, onError }) => {
  const [form] = Form.useForm<PublishFormValues>();
  const msg = useApiMessage();
  const [accounts, setAccounts] = useState<PublisherAccountVo[]>([]);
  const [accountsDegraded, setAccountsDegraded] = useState(false);
  const [saving, setSaving] = useState(false);

  // 打开时拉启用账号；失败静默降级（仅授 manage 无 view 的角色不 toast 报错）
  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    form.setFieldsValue({ range: [dayjs(), dayjs()] });
    listPublisherAccounts()
      .then((list) => {
        setAccounts(list.filter((item) => item.status === 1));
        setAccountsDegraded(false);
      })
      .catch(() => {
        setAccounts([]);
        setAccountsDegraded(true);
      });
  }, [open, form]);

  const submit = async (values: PublishFormValues) => {
    setSaving(true);
    try {
      const [start, end] = values.range ?? [dayjs(), dayjs()];
      await createPublisherRecord({
        novelProjectId: projectId,
        platform: values.platform,
        ...(values.accountId ? { accountId: values.accountId } : {}),
        ...(values.title?.trim() ? { title: values.title.trim() } : {}),
        publishedAt: (end ?? start).toISOString(),
        ...(values.receiptUrl?.trim() ? { receiptUrl: values.receiptUrl.trim() } : {}),
        ...(values.note?.trim() ? { note: values.note.trim() } : {})
      });
      msg.success('发布记录已登记');
      onRegistered();
      onClose();
    } catch (error) {
      msg.errorFrom(error, '登记失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SelfModal
      open={open}
      title="登记发布结果"
      onCancel={onClose}
      onOk={() => void form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      {accountsDegraded && (
        <div className="mb-3 text-xs text-text-sub">账号列表加载受限，可选择平台后留空账号直接登记</div>
      )}
      <SelfForm form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
          <Select options={PLATFORM_OPTIONS} placeholder="请选择发布平台" />
        </Form.Item>
        <Form.Item name="accountId" label="账号（可选）">
          <Select
            allowClear
            placeholder={accounts.length ? '请选择发布账号' : '账号列表不可用，可留空'}
            options={accounts.map((item) => ({ value: item.id, label: `${item.accountName}（${PUBLISHER_PLATFORM_LABELS[item.platform] ?? item.platform}）` }))}
          />
        </Form.Item>
        <Form.Item name="title" label="发布标题">
          <Input maxLength={255} placeholder="发布时使用的标题（可选）" />
        </Form.Item>
        <Form.Item name="range" label="发布时间" rules={[{ required: true, message: '请选择发布时间' }]}>
          <DatePicker.RangePicker showTime className="w-full" />
        </Form.Item>
        <Form.Item
          name="receiptUrl"
          label="回执链接"
          rules={[{ type: 'url', message: '请输入合法链接' }]}
        >
          <Input maxLength={500} placeholder="平台作品页链接（可选）" />
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} maxLength={2000} placeholder="备注（可选）" />
        </Form.Item>
      </SelfForm>
    </SelfModal>
  );
};
