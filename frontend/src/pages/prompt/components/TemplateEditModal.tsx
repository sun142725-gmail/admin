// 模板编辑弹窗：新建/编辑共用表单（分类 options 由 props 传入，与页面筛选下拉同源）。
// 保存逻辑内聚：按 editing 有无调 create/update，成功后 onSaved 上抛（页面统一 reloadAll）。
import { useEffect, useState } from 'react';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import { PromptLibraryItem, createPromptTemplate, updatePromptTemplate } from '../../../api/promptLibrary';
import { SelfForm } from '../../../components/base/SelfForm';
import { SelfModal } from '../../../components/base/SelfModal';
import { useApiMessage } from '../../../hooks/useApiMessage';

export interface TemplateFormValues {
  name: string;
  category: string;
  styleTags?: string;
  template: string;
  negativePrompt?: string;
  exampleImageUrl?: string;
  source?: string;
}

interface TemplateEditModalProps {
  open: boolean;
  editing: PromptLibraryItem | null; // null = 新建
  categoryOptions: Array<{ value: string; label: string }>;
  onCancel: () => void;
  onSaved: () => void;
}

export const TemplateEditModal: React.FC<TemplateEditModalProps> = ({
  open,
  editing,
  categoryOptions,
  onCancel,
  onSaved
}) => {
  const [form] = Form.useForm<TemplateFormValues>();
  const [saving, setSaving] = useState(false);
  const msg = useApiMessage();

  // 打开时同步表单：编辑回填、新建复位并给默认分类（关闭即弃，不留旧值/旧校验态）。
  useEffect(() => {
    if (!open) {
      return;
    }
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        category: editing.category,
        styleTags: editing.styleTags ?? undefined,
        template: editing.template,
        negativePrompt: editing.negativePrompt ?? undefined,
        exampleImageUrl: editing.exampleImageUrl ?? undefined,
        source: editing.source ?? undefined
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ category: 'illustrated' });
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updatePromptTemplate(editing.id, values);
        msg.success('模板已更新');
      } else {
        await createPromptTemplate(values);
        msg.success('模板已创建');
      }
      onSaved();
    } catch {
      // 校验失败/http 层已提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <SelfModal
      title={editing ? '编辑模板' : '新建模板'}
      open={open}
      onOk={() => void handleOk()}
      onCancel={onCancel}
      confirmLoading={saving}
      okText="保存"
      width="md"
    >
      <SelfForm form={form}>
        <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如：水彩绘本插画" maxLength={128} />
        </Form.Item>
        {/* category 后端已放开为自由字符串；options=常用枚举 ∪ stats.byCategory 动态合并，
            存量自由分类（sync 塞入）可正常回显与编辑 */}
        <Form.Item name="category" label="风格分类" rules={[{ required: true, message: '请选择分类' }]}>
          <Select options={categoryOptions} />
        </Form.Item>
        <Form.Item name="styleTags" label="风格标签（逗号分隔）">
          <Input placeholder="水彩,手绘,温暖" maxLength={255} />
        </Form.Item>
        <Form.Item
          name="template"
          label="Prompt 模板"
          rules={[{ required: true, message: '请输入模板正文' }]}
          extra="支持 {{content}} 占位，流水线生图时会替换为分幕内容"
        >
          <Input.TextArea rows={4} maxLength={8000} showCount />
        </Form.Item>
        <Form.Item name="negativePrompt" label="反向提示词（可选）">
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
        <Form.Item name="exampleImageUrl" label="示例图 URL（可选）">
          <Input placeholder="https://..." maxLength={500} />
        </Form.Item>
        <Form.Item name="source" label="来源（可选）">
          <Input placeholder="原创 / 复刻自 xxx" maxLength={64} />
        </Form.Item>
      </SelfForm>
    </SelfModal>
  );
};
