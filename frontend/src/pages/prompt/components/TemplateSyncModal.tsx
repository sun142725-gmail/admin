// 批量同步弹窗：Tabs 双模式——
//   快速粘贴：每行一条 prompt + 统一 category/sourceTool（原行为保留）；
//   结构化 JSON：粘贴对象数组，逐条 title/category/sourceModel/imageUrl/sourceUrl 全量打通
//     （后端 SyncPromptTemplateItemDto 字段全集，此前这些字段前端完全没有入口）。
// 前端 parse+校验：prompt 必填 / 字段白名单（未知字段丢弃并警告）/ 200 条截断 / 错误报行号。
import { useEffect, useState } from 'react';
import { Form, Input, Modal, Tabs, message } from 'antd';
import { SyncPromptImageItem, syncPromptImages } from '../../../api/promptLibrary';

interface QuickSyncFormValues {
  category?: string;
  sourceTool?: string;
  prompts: string;
}

interface StructuredSyncFormValues {
  payload: string;
}

// 同步单次上限与后端 SyncPromptTemplatesDto（ArrayMaxSize(200)）对齐。
const SYNC_MAX_ITEMS = 200;

// 可选字符串字段白名单与长度上限（对齐后端 SyncPromptTemplateItemDto 各 @Length）。
const STRING_FIELD_LIMITS: Record<string, number> = {
  title: 128,
  category: 64,
  sourceTool: 64,
  sourceModel: 64,
  imageUrl: 500,
  sourceUrl: 500
};

type ParseResult =
  | { ok: true; items: SyncPromptImageItem[]; warnings: string[] }
  | { ok: false; error: string };

/** 结构化 JSON 解析与逐条校验（错误带行号；prompt 必填、白名单外字段丢弃并警告、超限报错）。 */
export const parseStructuredItems = (raw: string): ParseResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: '需为 JSON 数组，如 [{"prompt":"…","category":"fantasy","title":"标题"}]' };
  }
  if (parsed.length === 0) {
    return { ok: false, error: '数组为空，请至少提供一条' };
  }
  const warnings: string[] = [];
  if (parsed.length > SYNC_MAX_ITEMS) {
    warnings.push(`单次最多 ${SYNC_MAX_ITEMS} 条，已截取前 ${SYNC_MAX_ITEMS} 条`);
  }
  const known = new Set(['prompt', ...Object.keys(STRING_FIELD_LIMITS)]);
  const items: SyncPromptImageItem[] = [];
  const errors: string[] = [];
  parsed.slice(0, SYNC_MAX_ITEMS).forEach((entry, index) => {
    const line = index + 1;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      errors.push(`第 ${line} 条：需为对象`);
      return;
    }
    const record = entry as Record<string, unknown>;
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
    if (!prompt) {
      errors.push(`第 ${line} 条：prompt 必填（非空字符串）`);
      return;
    }
    if (prompt.length > 20000) {
      errors.push(`第 ${line} 条：prompt 超过 20000 字符上限`);
      return;
    }
    const item: SyncPromptImageItem = { prompt };
    let valid = true;
    for (const [field, limit] of Object.entries(STRING_FIELD_LIMITS)) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (typeof value !== 'string') {
        errors.push(`第 ${line} 条：字段 ${field} 需为字符串`);
        valid = false;
        break;
      }
      const trimmed = value.trim();
      if (trimmed.length > limit) {
        errors.push(`第 ${line} 条：字段 ${field} 超过 ${limit} 字符上限`);
        valid = false;
        break;
      }
      item[field as keyof SyncPromptImageItem] = trimmed;
    }
    if (!valid) {
      return;
    }
    const unknownKeys = Object.keys(record).filter((key) => !known.has(key));
    if (unknownKeys.length > 0) {
      warnings.push(`第 ${line} 条：白名单外字段已忽略（${unknownKeys.join(', ')}）`);
    }
    items.push(item);
  });
  if (errors.length > 0) {
    const head = errors.slice(0, 5).join('；');
    return { ok: false, error: errors.length > 5 ? `${head}（共 ${errors.length} 处错误）` : head };
  }
  return { ok: true, items, warnings };
};

interface TemplateSyncModalProps {
  open: boolean;
  onCancel: () => void;
  onSynced: () => void;
}

export const TemplateSyncModal: React.FC<TemplateSyncModalProps> = ({ open, onCancel, onSynced }) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'structured'>('quick');
  const [syncing, setSyncing] = useState(false);
  const [quickForm] = Form.useForm<QuickSyncFormValues>();
  const [structuredForm] = Form.useForm<StructuredSyncFormValues>();

  // 关闭即复位两个表单与告警态，防缓存旧粘贴内容。
  useEffect(() => {
    if (!open) {
      quickForm.resetFields();
      structuredForm.resetFields();
      setActiveTab('quick');
    }
  }, [open, quickForm, structuredForm]);

  const submit = async (items: SyncPromptImageItem[]) => {
    setSyncing(true);
    try {
      const result = await syncPromptImages(items);
      message.success(`同步完成：新增 ${result.inserted}，跳过 ${result.skipped}（共提交 ${result.received} 条）`);
      onSynced();
    } catch {
      // http 层已统一提示
    } finally {
      setSyncing(false);
    }
  };

  const handleOk = async () => {
    if (activeTab === 'quick') {
      const values = await quickForm.validateFields();
      const prompts = values.prompts
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (prompts.length === 0) {
        message.warning('请粘贴至少一条 Prompt');
        return;
      }
      if (prompts.length > SYNC_MAX_ITEMS) {
        message.warning(`单次最多 ${SYNC_MAX_ITEMS} 条，已截取前 ${SYNC_MAX_ITEMS} 条`);
      }
      await submit(
        prompts.slice(0, SYNC_MAX_ITEMS).map((prompt) => ({
          prompt,
          category: values.category?.trim() || undefined,
          sourceTool: values.sourceTool?.trim() || undefined
        }))
      );
      return;
    }
    const { payload } = await structuredForm.validateFields();
    const parsed = parseStructuredItems(payload);
    if (!parsed.ok) {
      message.error(parsed.error);
      return;
    }
    parsed.warnings.forEach((warning) => message.warning(warning));
    await submit(parsed.items);
  };

  return (
    <Modal
      title="批量同步提示词"
      open={open}
      onOk={() => void handleOk()}
      onCancel={onCancel}
      confirmLoading={syncing}
      okText="开始同步"
      width={680}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'quick' | 'structured')}
        items={[
          {
            key: 'quick',
            label: '快速粘贴（每行一条）',
            children: (
              <Form form={quickForm} layout="vertical">
                <Form.Item name="category" label="统一分类（可选，默认 general）">
                  <Input placeholder="如：anime / fantasy / starry / xianxia" maxLength={64} />
                </Form.Item>
                <Form.Item name="sourceTool" label="统一来源工具（可选）">
                  <Input placeholder="如：midjourney / novelai" maxLength={64} />
                </Form.Item>
                <Form.Item
                  name="prompts"
                  label={`Prompt 列表（每行一条，单次最多 ${SYNC_MAX_ITEMS} 条）`}
                  rules={[{ required: true, message: '请粘贴 Prompt，每行一条' }]}
                  extra="按正文去重（sha256 幂等），重复提交只会计入跳过，不会产生重复条目"
                >
                  <Input.TextArea rows={10} placeholder={'一条完整 Prompt 独占一行\n第二条 Prompt…'} maxLength={200000} />
                </Form.Item>
              </Form>
            )
          },
          {
            key: 'structured',
            label: '结构化 JSON（逐条标题/分类/示例图）',
            children: (
              <Form form={structuredForm} layout="vertical">
                <Form.Item
                  name="payload"
                  label={`JSON 数组（单次最多 ${SYNC_MAX_ITEMS} 条）`}
                  rules={[{ required: true, message: '请粘贴 JSON 数组' }]}
                  extra={
                    '每条字段：prompt 必填；title / category / sourceTool / sourceModel / imageUrl / sourceUrl 可选。' +
                    '示例：[{"prompt":"风格：{{content}}。","title":"星空夜景","category":"starry","sourceModel":"nova-v3"}]'
                  }
                >
                  <Input.TextArea
                    rows={12}
                    placeholder={'[\n  {"prompt": "风格：{{content}}。", "title": "标题", "category": "starry"}\n]'}
                    maxLength={400000}
                  />
                </Form.Item>
              </Form>
            )
          }
        ]}
      />
    </Modal>
  );
};
