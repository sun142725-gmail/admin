// 图文故事页：导入原文 → LLM 自动分幕 → 按提示词库风格并发生图。
// 进度采用 3s 轮询（SSE 经网关透传可用，轮询作为简单可靠的兜底）。
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message
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
import '../flow/flow-pages.css';

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: '待生成', color: 'default' },
  running: { label: '生成中', color: 'processing' },
  succeeded: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' }
};

const SCENE_STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  skipped: 'warning',
  cancelled: 'warning'
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
      message.success('故事已创建');
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
      message.success('已开始生成，进度请关注状态');
      refresh();
    } catch {
      // ignore
    }
  };

  const handleCancel = async (story: GraphicStory) => {
    try {
      await cancelGraphicStory(story.id);
      message.info('已请求取消');
      refresh();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (story: GraphicStory) => {
    // MVP：删除走状态过滤（Go 侧暂未暴露 DELETE，后续补充）
    message.info('删除接口将在下一迭代提供');
    void story;
  };

  return (
    <Card
      title="图文故事"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建故事
          </Button>
        </Space>
      }
    >
      {stories.length === 0 && !loading ? (
        <Empty description="还没有图文故事，点击右上角新建" />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {stories.map((story) => {
            const meta = STATUS_META[story.status] ?? STATUS_META.draft;
            return (
              <Card key={story.id} size="small" hoverable onClick={() => openDetail(story.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <Typography.Text strong>{story.title}</Typography.Text>
                    {story.mode === 'anime' ? <Tag color="geekblue">动漫</Tag> : null}
                    <Tag>{STYLE_OPTIONS.find((o) => o.value === story.styleCategory)?.label ?? story.styleCategory}</Tag>
                    <Tag color={meta.color}>{meta.label}</Tag>
                    {story.durationMs ? <Tag>{(story.durationMs / 1000).toFixed(1)}s</Tag> : null}
                  </Space>
                  <Space onClick={(e) => e.stopPropagation()}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(story.id)}>
                      详情
                    </Button>
                    {story.status === 'running' ? (
                      <Popconfirm title="确定取消该故事？" onConfirm={() => handleCancel(story)}>
                        <Button size="small" danger icon={<StopOutlined />}>
                          取消
                        </Button>
                      </Popconfirm>
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
                    <Popconfirm title="确定删除该故事？" onConfirm={() => handleDelete(story)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
                {story.error ? (
                  <Typography.Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                    {story.error}
                  </Typography.Text>
                ) : null}
              </Card>
            );
          })}
        </Space>
      )}

      <Modal
        title="新建图文故事"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        okText="创建"
        width={640}
      >
        <Form form={form} layout="vertical">
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
        </Form>
      </Modal>

      <Modal
        title={detail ? detail.story.title : '详情'}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={860}
      >
        {detail && (
          <>
            <Descriptions size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="模式">
                <Tag color={detail.story.mode === 'anime' ? 'geekblue' : 'default'}>
                  {detail.story.mode === 'anime' ? '动漫视频' : '图文'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={(STATUS_META[detail.story.status] ?? STATUS_META.draft).color}>
                  {(STATUS_META[detail.story.status] ?? STATUS_META.draft).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {detail.story.durationMs ? `${(detail.story.durationMs / 1000).toFixed(1)}s` : '-'}
              </Descriptions.Item>
            </Descriptions>
            {detail.story.error ? (
              <Typography.Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
                {detail.story.error}
              </Typography.Text>
            ) : null}
            {detail.story.videoUrl ? (
              <Card size="small" title="成片" style={{ marginBottom: 16 }}>
                <video src={detail.story.videoUrl} controls style={{ width: '100%', maxHeight: 420 }} />
              </Card>
            ) : null}
            {detail.scenes.length === 0 ? (
              <Empty description="尚未分幕，点击生成开始" />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {detail.scenes.map((scene) => (
                  <Card key={scene.id} size="small">
                    <Space style={{ marginBottom: 8 }}>
                      <Tag>幕 {scene.idx}</Tag>
                      <Typography.Text strong>{scene.name}</Typography.Text>
                      <Tag color={SCENE_STATUS_COLOR[scene.status] ?? 'default'}>{scene.status}</Tag>
                      {scene.durationMs ? <Tag>{(scene.durationMs / 1000).toFixed(1)}s</Tag> : null}
                    </Space>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                      {scene.content}
                    </Typography.Paragraph>
                    {scene.imageUrl ? (
                      <Image src={scene.imageUrl} alt={scene.name} width={280} style={{ borderRadius: 8 }} />
                    ) : null}
                    {scene.audioUrl ? (
                      <div style={{ marginTop: 8 }}>
                        <audio src={scene.audioUrl} controls style={{ width: 280, height: 32 }} />
                      </div>
                    ) : null}
                    {scene.error ? (
                      <Typography.Text type="danger" style={{ fontSize: 12 }}>
                        {scene.error}
                      </Typography.Text>
                    ) : null}
                  </Card>
                ))}
              </Space>
            )}
          </>
        )}
      </Modal>
    </Card>
  );
}
