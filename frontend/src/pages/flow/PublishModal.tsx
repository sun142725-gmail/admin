// 成片发布弹窗（手动登记）：平台/账号联动 + 标题 + 发布时间 + 回执链接 + 备注。
// 账号列表加载失败（含仅授 manage 无 view 的 403）静默降级：平台退化为静态六项、账号可空
// （评审修正④：仅授 manage 无 view 的角色仍能完成手动登记）。
// 合规检查链接入（UI 契约 §4）：提交前先 POST /compliance/check（与登记同挂 publisher:manage）——
// blocked 阻断登记只弹报告；review 弹报告由用户选「仍要登记/返回修改」；pass 正常登记。
// fail-safe 写死：检查请求失败（网络/4xx）msg.errorFrom 并阻断提交，检查链不可用不得静默放行。
// aigcDeclared 默认 false 强制显式勾选（未勾选提交即 blocked——平台强制红线），请求体恒显式布尔。
import { useEffect, useState } from 'react';
import Button from 'antd/es/button';
import DatePicker from 'antd/es/date-picker';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Switch from 'antd/es/switch';
import dayjs, { type Dayjs } from 'dayjs';
import {
  PUBLISHER_PLATFORMS,
  PUBLISHER_PLATFORM_LABELS,
  PublisherAccountVo,
  createPublisherRecord,
  listPublisherAccounts,
  type PublisherPlatform
} from '../../api/publisher';
import { ComplianceReport, runComplianceCheck } from '../../api/compliance';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { useApiMessage } from '../../hooks/useApiMessage';
import { ComplianceReportModal } from './ComplianceReportModal';
import { buildCheckPayload } from './complianceReportUI';

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
  aigcDeclared?: boolean;
}

const PLATFORM_OPTIONS = PUBLISHER_PLATFORMS.map((value) => ({ value, label: PUBLISHER_PLATFORM_LABELS[value] }));

export const PublishModal: React.FC<PublishModalProps> = ({ open, projectId, onClose, onRegistered, onError }) => {
  const [form] = Form.useForm<PublishFormValues>();
  const msg = useApiMessage();
  const [accounts, setAccounts] = useState<PublisherAccountVo[]>([]);
  const [accountsDegraded, setAccountsDegraded] = useState(false);
  const [saving, setSaving] = useState(false);
  // 合规检查链状态（UI 契约 §4）：checking 合并进提交按钮 loading；report/reportOpen 驱动报告弹窗；
  // pendingValues 供 review「仍要登记」确认后复用本次表单值继续登记。
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<PublishFormValues | null>(null);

  // 打开时拉启用账号；失败静默降级（仅授 manage 无 view 的角色不 toast 报错）；同时复位检查链状态
  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    // aigcDeclared 默认 false：强制显式勾选，表单恒有布尔值（未勾选提交即 blocked，平台强制红线）
    form.setFieldsValue({ range: [dayjs(), dayjs()], aigcDeclared: false });
    setReport(null);
    setReportOpen(false);
    setPendingValues(null);
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

  // 第 4 步：实际登记（aigcDeclared 不入发布记录——发布记录实体不加列，登记行为不变）
  const registerRecord = async (values: PublishFormValues) => {
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
      setReportOpen(false);
      msg.success('发布记录已登记');
      onRegistered();
      onClose();
    } catch (error) {
      msg.errorFrom(error, '登记失败');
    } finally {
      setSaving(false);
    }
  };

  // review 场景「仍要登记」：复用检查通过时的表单值继续登记（关闭报告弹窗）
  const confirmRegisterAfterReview = async () => {
    if (!pendingValues) {
      return;
    }
    await registerRecord(pendingValues);
  };

  const submit = async (values: PublishFormValues) => {
    setChecking(true);
    try {
      // 1) 提交前检查（只读不落库）；description/tags 本期不传（发布记录表无对应列，契约预留）
      const checkReport = await runComplianceCheck(buildCheckPayload(values.title, values.note, values.aigcDeclared));
      // 2) blocked：弹报告阻止登记，不调用 createPublisherRecord
      if (checkReport.verdict === 'blocked') {
        setReport(checkReport);
        setReportOpen(true);
        return;
      }
      // 3) review：弹报告由用户选「仍要登记 / 返回修改」，不强制阻断
      if (checkReport.verdict === 'review') {
        setPendingValues(values);
        setReport(checkReport);
        setReportOpen(true);
        return;
      }
      // 4) pass：正常登记
      await registerRecord(values);
    } catch (error) {
      // fail-safe：检查链不可用（网络/4xx）阻断提交，不静默放行
      msg.errorFrom(error, '合规检查失败，已阻止提交');
    } finally {
      setChecking(false);
    }
  };

  return (
    <SelfModal
      open={open}
      title="登记发布结果"
      onCancel={onClose}
      onOk={() => void form.submit()}
      confirmLoading={saving || checking}
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
        <Form.Item
          name="aigcDeclared"
          label="已声明 AI 生成标识"
          valuePropName="checked"
          extra="各平台对 AI 生成内容强制要求标识声明"
        >
          <Switch checkedChildren="已声明" unCheckedChildren="未声明" />
        </Form.Item>
      </SelfForm>
      <ComplianceReportModal
        open={reportOpen}
        report={report}
        onClose={() => setReportOpen(false)}
        footerSlot={
          report?.verdict === 'review' ? (
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => setReportOpen(false)}>返回修改</Button>
              <Button type="primary" loading={saving || checking} onClick={() => void confirmRegisterAfterReview()}>
                仍要登记
              </Button>
            </div>
          ) : undefined
        }
      />
    </SelfModal>
  );
};
