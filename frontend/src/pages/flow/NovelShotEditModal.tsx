// 单镜编辑弹窗：片段级创作控制（锁定原文/视觉任务/推进方式/生成模式/首帧锁定/旁白）。
// 画面与运动提示词不可在此直接改——由「AI 重新规划」生成，这里折叠只读展示供核对。
import { useEffect, useMemo, useState } from 'react';
import { Alert, Collapse, Form, Input, Modal, Select, Switch, Tag, Typography } from 'antd';
import { updateNovelShot, NovelShotVo, UpdateNovelShotPayload } from '../../api/novelVideo';
import './flow-pages.css';

export interface NovelShotEditModalProps {
  open: boolean;
  projectId: number;
  shot: NovelShotVo | null;
  onCancel: () => void;
  onSaved: (shot: NovelShotVo) => void;
  onError: (error: unknown) => void;
}

interface ShotFormValues {
  lockedSourceText?: string;
  visualTask?: string;
  progression?: string;
  shotMode?: string;
  firstFrameLocked?: boolean;
  narration?: string;
}

// 生成模式：i2v 用首帧图生视频（画面连贯）；t2v 纯文生视频（无首帧/首帧被锁时用）。
const SHOT_MODE_OPTIONS = [
  { value: 'i2v', label: '图生视频（用首帧）' },
  { value: 't2v', label: '文生视频（纯文本）' }
];

export const NovelShotEditModal: React.FC<NovelShotEditModalProps> = ({
  open,
  projectId,
  shot,
  onCancel,
  onSaved,
  onError
}) => {
  const [form] = Form.useForm<ShotFormValues>();
  const [saving, setSaving] = useState(false);

  const initialValues = useMemo((): ShotFormValues | undefined => {
    if (!shot) {
      return undefined;
    }
    return {
      lockedSourceText: shot.lockedSourceText ?? '',
      visualTask: shot.visualTask ?? '',
      progression: shot.progression ?? '',
      shotMode: shot.shotMode || 'i2v',
      firstFrameLocked: Boolean(shot.firstFrameLocked),
      narration: shot.narration ?? ''
    };
  }, [shot]);

  useEffect(() => {
    if (open && initialValues) {
      form.resetFields();
      form.setFieldsValue(initialValues);
    }
  }, [open, initialValues, form]);

  const submit = async () => {
    if (!shot) {
      return;
    }
    const values = await form.validateFields();
    const payload: UpdateNovelShotPayload = {
      lockedSourceText: values.lockedSourceText?.trim() ? values.lockedSourceText.trim() : null,
      visualTask: values.visualTask?.trim() ? values.visualTask.trim() : null,
      progression: values.progression?.trim() ? values.progression.trim() : null,
      shotMode: values.shotMode,
      firstFrameLocked: Boolean(values.firstFrameLocked),
      narration: values.narration?.trim() ? values.narration.trim() : null
    };
    setSaving(true);
    try {
      onSaved(await updateNovelShot(projectId, shot.id, payload));
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={shot ? `编辑分镜 #${shot.idx}` : '编辑分镜'}
      open={open}
      onCancel={onCancel}
      onOk={() => void submit()}
      okText="保存"
      confirmLoading={saving}
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="lockedSourceText"
          label="锁定原文"
          extra="非空时「AI 重新规划」只优化画面与镜头运动，旁白以这段原文为准不被改写"
        >
          <Input.TextArea rows={3} maxLength={5000} placeholder="粘贴该分镜对应的原文片段…" />
        </Form.Item>
        <Form.Item name="visualTask" label="本镜头视觉任务" extra="这一镜画面要传达的关键信息，出图时并入首帧提示词">
          <Input.TextArea rows={2} maxLength={2000} placeholder="如：突出主角回头的瞬间，逆光" />
        </Form.Item>
        <Form.Item name="progression" label="相对上一镜头的推进" extra="出视频时并入运动提示词">
          <Input maxLength={200} placeholder="如：缓慢推进 / 快速拉远 / 视角切换" />
        </Form.Item>
        <Form.Item name="shotMode" label="生成模式" extra="i2v 需已有首帧图且未锁定；无首帧时请选文生视频">
          <Select options={SHOT_MODE_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="firstFrameLocked"
          label="锁定首帧图"
          valuePropName="checked"
          extra="开启后重跑与单镜重生成不再覆盖这张首帧图"
        >
          <Switch checkedChildren="已锁" unCheckedChildren="未锁" />
        </Form.Item>
        <Form.Item name="narration" label="旁白/台词" extra="配音与字幕的依据，30 字内效果最佳">
          <Input.TextArea rows={2} maxLength={5000} placeholder="如：他推开门，看见漫天大雪。" />
        </Form.Item>
      </Form>
      {shot && (
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'prompts',
              label: <span style={{ fontSize: 12 }}>高级：画面 / 运动提示词（只读，走「AI 重新规划」修改）</span>,
              children: (
                <div className="novel-shot-prompt-review">
                  <div>
                    <Tag color="purple" style={{ marginRight: 4 }}>
                      首帧
                    </Tag>
                    <Typography.Paragraph copyable style={{ fontSize: 12, marginBottom: 4 }}>
                      {shot.scenePrompt || '—'}
                    </Typography.Paragraph>
                  </div>
                  <div>
                    <Tag color="orange" style={{ marginRight: 4 }}>
                      运动
                    </Tag>
                    <Typography.Paragraph copyable style={{ fontSize: 12, marginBottom: 0 }}>
                      {shot.motionPrompt || '—'}
                    </Typography.Paragraph>
                  </div>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginTop: 8, fontSize: 12 }}
                    message="提示词由 AI 重新规划生成；保存本弹窗不会改动它们。"
                  />
                </div>
              )
            }
          ]}
        />
      )}
    </Modal>
  );
};
