// 图文故事页：导入原文 → LLM 自动分幕 → 按提示词库风格并发生图。
// 进度采用 3s 轮询（SSE 经网关透传可用，轮询作为简单可靠的兜底）。
// 2026-10-31：移除无用跨组样式依赖（页面未使用 flow-pages.css 任何类）；Card title+extra 收编 PageHeader；
// 状态表收编 StatusTag；空态迁 EmptyState；Popconfirm→ConfirmPopconfirm；Modal→SelfModal；Form→SelfForm。
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Form,
  Image,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';
import {
  CaretRightOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined
} from '@ant-design/icons';
import {
  GraphicScene,
  GraphicStory,
  cancelGraphicStory,
  createGraphicStory,
  getGraphicStory,
  listGraphicStories,
  runGraphicStory
} from '../../api/graphic';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { ConfirmPopconfirm } from '../../components/business/ConfirmAction';
import { EmptyState } from '../../components/business/PagePanel';
import { PageHeader } from '../../components/business/PageHeader';
import { StatusTag } from '../../components/business/StatusTag';
import { useApiMessage } from '../../hooks/useApiMessage';
import type { StatusMeta } from '../../types/ui';

const STATUS_META: Record<string, StatusMeta> = {
  draft: { label: '待生成', color: 'default' },
  running: { label: '生成中', color: 'processing' },
  succeeded: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' }
};

// 幕状态标签：label 用原值（现状口径），色板走 antd 预设词
const SCENE_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: 'pending', color: 'default' },
  running: { label: 'running', color: 'processing' },
  succeeded: { label: 'succeeded', color: 'success' },
  failed: { label: 'failed', color: 'error' },
  skipped: { label: 'skipped', color: 'warning' },
  cancelled: { label: 'cancelled', color: 'warning' }
};

const STYLE_OPTIONS = [
  { value: 'illustrated', label: '插画绘本' },
  { value: 'poster', label: '海报设计' },
  { value: 'anime', label: '动漫' },
  { value: 'ui', label: 'UI 界面' },
  { value: 'general', label: '通用' }
];

const ACTIVE_STATUSES = ['running'];

export const GraphicPage: React.FC = () => {
  const [stories, setStories] = useState<GraphicStory[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [detail, setDetail] = useState<{ story: GraphicStory; scenes: GraphicScene[] } | null>(null);
  const msg = useApiMessage();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStories(await listGraphicStories());
    } catch {
      // http 层已统一提示
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 有进行中的故事时轮询刷新
  useEffect(() => {
    if (!stories.some((s) => ACTIVE_STATUSES.includes(s.status))) {
      return;
    }
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [stories, refresh]);

  const openDetail = async (id: number) => {
    try {
      setDetail(await getGraphicStory(id));
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    const values = await form.validateFields();
    setCreating(true);
    try {
      await createGraphicStory({
        title: values.title,
        styleCategory: values.styleCategory,
        sourceText: values.sourceText,
        mode: values.mode,
        continuity: values.mode === 'anime' ? values.continuity !== false : undefined,
        promptTemplateId: values.promptTemplateId ? Number(values.promptTemplateId) : undefined
      });
      msg.success('故事已创建');
      setCreateOpen(false);
      form.resetFields();
      refresh();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleRun = async (story: GraphicStory) => {
    try {
      await runGraphicStory(story.id);
      msg.success('已开始生成，进度请关注状态');
      refresh();
    } catch {
      // ignore
    }
  };

  const handleCancel = async (story: GraphicStory) => {
    try {
      await cancelGraphicStory(story.id);
      msg.info('已请求取消');
      refresh();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (story: GraphicStory) => {
    // MVP：删除走状态过滤（Go 侧暂未暴露 DELETE，后续补充）
    msg.info('删除接口将在下一迭代提供');
    void story;
  };

  return (
    <div>
      <PageHeader
        title="图文故事"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建故事
            </Button>
          </Space>
        }
      />

      {stories.length === 0 && !loading ? (
        <EmptyState description="还没有图文故事，点击右上角新建" />
      ) : (
        <Space direction="vertical" className="w-full" size={12}>
          {stories.map((story) => {
            return (
              <Card key={story.id} size="small" hoverable onClick={() => openDetail(story.id)}>
                <div className="flex justify-between items-center">
                  <Space>
                    <Typography.Text strong>{story.title}</Typography.Text>
                    {story.mode === 'anime' ? <Tag color="geekblue">动漫</Tag> : null}
                    <Tag>{STYLE_OPTIONS.find((o) => o.value === story.styleCategory)?.label ?? story.styleCategory}</Tag>
                    <StatusTag value={story.status} map={STATUS_META} fallback={STATUS_META.draft} />
                    {story.durationMs ? <Tag>{(story.durationMs / 1000).toFixed(1)}s</Tag> : null}
                  </Space>
                  <Space onClick={(e) => e.stopPropagation()}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(story.id)}>
                      详情
                    </Button>
                    {story.status === 'running' ? (
                      <ConfirmPopconfirm title="确定取消该故事？" onConfirm={() => handleCancel(story)}>
                        <Button size="small" danger icon={<StopOutlined />}>
                          取消
                        </Button>
                      </ConfirmPopconfirm>
                    ) : (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<CaretRightOutlined />}
                        onClick={() => handleRun(story)}
                      >
                        {story.status === 'failed' ? '重跑' : '生成'}
                      </Button>
                    )}
                    <ConfirmPopconfirm title="确定删除该故事？" onConfirm={() => handleDelete(story)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </ConfirmPopconfirm>
                  </Space>
                </div>
                {story.error ? (
                  <Typography.Text type="danger" className="text-xs block mt-2">
                    {story.error}
                  </Typography.Text>
                ) : null}
              </Card>
            );
          })}
        </Space>
      )}

      <SelfModal
        title="新建图文故事"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        okText="创建"
        width="md"
      >
        <SelfForm form={form}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：锦鲤物语" maxLength={64} />
          </Form.Item>
          <Form.Item name="mode" label="模式" initialValue="graphic" extra="动漫模式：首帧延续生图 + 配音 + 字幕 + 合成视频">
            <Select
              options={[
                { value: 'graphic', label: '图文（仅生图）' },
                { value: 'anime', label: '动漫视频（生图+配音+合成）' }
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode}>
            {({ getFieldValue }) =>
              getFieldValue('mode') === 'anime' ? (
                <Form.Item name="continuity" label="首帧延续" initialValue={true} valuePropName="checked" extra="上一幕成图作为下一幕参考图，保持角色与画风连贯（顺序生成，耗时更长）">
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="styleCategory" label="风格" rules={[{ required: true, message: '请选择风格' }]} initialValue="illustrated">
            <Select options={STYLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="promptTemplateId" label="提示词模板 ID（可选，留空用风格兜底）">
            <Input placeholder="提示词库里的模板 id" />
          </Form.Item>
          <Form.Item
            name="sourceText"
            label="故事原文"
            rules={[{ required: true, message: '请输入故事原文' }]}
            extra="提交后由 LLM 自动分幕（3-8 幕），再逐幕生图"
          >
            <Input.TextArea rows={6} maxLength={4000} showCount />
          </Form.Item>
        </SelfForm>
      </SelfModal>

      {/* 860 为刻度外现状值（README 归档映射待专项截图比对），number 透传零视觉变化 */}
      <SelfModal
        title={detail ? detail.story.title : '详情'}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={860}
      >
        {detail && (
          <>
            <Descriptions size="small" column={3} className="mb-4">
              <Descriptions.Item label="模式">
                <Tag color={detail.story.mode === 'anime' ? 'geekblue' : 'default'}>
                  {detail.story.mode === 'anime' ? '动漫视频' : '图文'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <StatusTag value={detail.story.status} map={STATUS_META} fallback={STATUS_META.draft} />
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {detail.story.durationMs ? `${(detail.story.durationMs / 1000).toFixed(1)}s` : '-'}
              </Descriptions.Item>
            </Descriptions>
            {detail.story.error ? (
              <Typography.Text type="danger" className="block mb-3">
                {detail.story.error}
              </Typography.Text>
            ) : null}
            {detail.story.videoUrl ? (
              <Card size="small" title="成片" className="mb-4">
                <video src={detail.story.videoUrl} controls className="w-full max-h-[420px]" />
              </Card>
            ) : null}
            {detail.scenes.length === 0 ? (
              <EmptyState description="尚未分幕，点击生成开始" />
            ) : (
              <Space direction="vertical" className="w-full" size={12}>
                {detail.scenes.map((scene) => (
                  <Card key={scene.id} size="small">
                    <Space className="mb-2">
                      <Tag>幕 {scene.idx}</Tag>
                      <Typography.Text strong>{scene.name}</Typography.Text>
                      <StatusTag value={scene.status} map={SCENE_STATUS_META} fallback={{ label: scene.status, color: 'default' }} />
                      {scene.durationMs ? <Tag>{(scene.durationMs / 1000).toFixed(1)}s</Tag> : null}
                    </Space>
                    <Typography.Paragraph type="secondary" className="text-xs !mb-2">
                      {scene.content}
                    </Typography.Paragraph>
                    {scene.imageUrl ? (
                      <Image src={scene.imageUrl} alt={scene.name} width={280} className="rounded-lg" />
                    ) : null}
                    {scene.audioUrl ? (
                      <div className="mt-2">
                        <audio src={scene.audioUrl} controls className="w-[280px] h-8" />
                      </div>
                    ) : null}
                    {scene.error ? (
                      <Typography.Text type="danger" className="text-xs">
                        {scene.error}
                      </Typography.Text>
                    ) : null}
                  </Card>
                ))}
              </Space>
            )}
          </>
        )}
      </SelfModal>
    </div>
  );
}
