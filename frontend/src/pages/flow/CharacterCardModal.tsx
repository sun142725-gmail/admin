// 角色卡弹窗：新建/编辑双模式。name/appearance/主角色开关 + 参考图上传（≤4 张，jpg/png，
// 走 files/upload；部分上游 images/edits 仅认 jpg/png）。
// 已上传图支持移除；删除角色卡不删已上传文件（孤儿文件可接受，v1 从简）。
import { useEffect, useMemo, useState } from 'react';
import Alert from 'antd/es/alert';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Switch from 'antd/es/switch';
import Upload from 'antd/es/upload';
import { PlusOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import {
  CharacterCardVo,
  createCharacterCard,
  updateCharacterCard,
  type SaveCharacterCardPayload
} from '../../api/novelVideo';
import { uploadFile } from '../../api/files';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { mergeReferenceImages } from './characterImages';

export interface CharacterCardModalProps {
  open: boolean;
  projectId: number;
  // null = 新建。
  card: CharacterCardVo | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}

interface CharacterFormValues {
  name: string;
  appearance?: string;
  isPrimary: boolean;
}

export const CharacterCardModal: React.FC<CharacterCardModalProps> = ({
  open,
  projectId,
  card,
  onCancel,
  onSaved,
  onError
}) => {
  const [form] = Form.useForm<CharacterFormValues>();
  const [saving, setSaving] = useState(false);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  // 打开时重置：编辑模式回填已有值（含参考图），新建模式清空。
  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      name: card?.name ?? '',
      appearance: card?.appearance ?? '',
      isPrimary: card?.isPrimary ?? false
    });
    setReferenceImages(card?.referenceImages ?? []);
    setUploadingCount(0);
  }, [open, card, form]);

  // Upload 受控 fileList：由 referenceImages 派生（url 即身份）。
  const fileList = useMemo<UploadFile[]>(
    () =>
      referenceImages.map((url, index) => ({
        uid: `ref-${index}-${url}`,
        name: url.split('/').pop() ?? url,
        url,
        status: 'done'
      })),
    [referenceImages]
  );

  const handleUpload = async (file: File) => {
    if (file.type && !['image/jpeg', 'image/png'].includes(file.type)) {
      onError(new Error('参考图仅支持 jpg/png'));
      return;
    }
    setUploadingCount((count) => count + 1);
    try {
      const uploaded = await uploadFile(file);
      setReferenceImages((prev) => mergeReferenceImages(prev, [uploaded.url]));
    } catch (error) {
      onError(error);
    } finally {
      setUploadingCount((count) => count - 1);
    }
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload: SaveCharacterCardPayload = {
        name: values.name.trim(),
        appearance: values.appearance?.trim() || undefined,
        referenceImages,
        isPrimary: Boolean(values.isPrimary)
      };
      if (card) {
        await updateCharacterCard(card.id, payload);
      } else {
        await createCharacterCard(projectId, payload);
      }
      onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SelfModal
      title={card ? `编辑角色：${card.name}` : '新建角色'}
      open={open}
      onCancel={onCancel}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      width={560}
      destroyOnHidden
    >
      <SelfForm form={form} requiredMark={false}>
        <Form.Item name="name" label="角色名" rules={[{ required: true, message: '请输入角色名' }]}>
          <Input maxLength={64} placeholder="如：林晚" />
        </Form.Item>
        <Form.Item
          name="appearance"
          label="外观描述"
          extra="写性别/年龄/发型/服饰/气质等，将并入每个分镜的首帧提示词"
        >
          <Input.TextArea rows={3} maxLength={2000} placeholder="如：女，22 岁，银白长发，红瞳，黑色风衣，冷漠少言" />
        </Form.Item>
        <Form.Item label="角色参考图（≤4 张，jpg/png）" extra="出图时作为图生图参考，配合外观描述保持多镜头形象一致">
          <Upload
            listType="picture-card"
            accept="image/jpeg,image/png"
            fileList={fileList}
            maxCount={4}
            beforeUpload={(file) => {
              void handleUpload(file);
              return false;
            }}
            onRemove={(file) => {
              if (file.url) {
                setReferenceImages((prev) => prev.filter((url) => url !== file.url));
              }
              return false;
            }}
          >
            {referenceImages.length < 4 && (
              <div className="flex flex-col items-center text-xs text-[#999]">
                <PlusOutlined />
                <span className="mt-1">上传</span>
              </div>
            )}
          </Upload>
        </Form.Item>
        <Form.Item
          name="isPrimary"
          label="设为主角色"
          valuePropName="checked"
          extra="主角色的参考图优先注入分镜生图"
        >
          <Switch checkedChildren="主角色" unCheckedChildren="普通" />
        </Form.Item>
      </SelfForm>
      <Alert type="info" showIcon className="text-xs" message={uploadingCount > 0 ? '参考图上传中…' : '参考图上传后可在上方缩略图点击移除；删除角色不会删除已上传的文件。'} />
    </SelfModal>
  );
};
