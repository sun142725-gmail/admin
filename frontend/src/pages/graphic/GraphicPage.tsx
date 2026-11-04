// AI 生成漫画页：导入原文 → LLM 自动分幕 → 按提示词库风格并发生图 → 分格漫画预览 → 导出 PNG 长图。
// 漫画版式由 comicLayout.ts 纯函数计算，CSS 预览与 canvas 导出共用同一份布局（所见即所得）。
// 进度采用 3s 轮询（SSE 经网关透传可用，轮询作为简单可靠的兜底）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Form,
  Image,
  Input,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';
import {
  CaretRightOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  RedoOutlined,
  ReloadOutlined,
  StopOutlined
} from '@ant-design/icons';
import {
  GraphicScene,
  GraphicStory,
  cancelGraphicStory,
  createGraphicStory,
  deleteGraphicStory,
  getGraphicStory,
  listGraphicStories,
  regenerateGraphicScene,
  runGraphicStory
} from '../../api/graphic';
import { listPromptImages } from '../../api/promptLibrary';
import type { PromptLibraryItem } from '../../api/promptLibrary';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { ConfirmPopconfirm } from '../../components/business/ConfirmAction';
import { EmptyState } from '../../components/business/PagePanel';
import { PageHeader } from '../../components/business/PageHeader';
import { StatusTag } from '../../components/business/StatusTag';
import { useApiMessage } from '../../hooks/useApiMessage';
import type { StatusMeta } from '../../types/ui';
import { COMIC_PRESETS, estimateComicTextWidth, layoutComic } from './comicLayout';
import type { ComicLayout, ComicPreset } from './comicLayout';
import { COMIC_FONT_FAMILY, renderComicPng } from './comicExport';

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

/** 与 canvas 导出同版式的 CSS 预览：固定页宽 + 绝对定位格位，外层横向滚动。 */
const ComicPreview: React.FC<{ layout: ComicLayout }> = ({ layout }) => {
  if (layout.pages.length === 0) {
    return <EmptyState description="还没有分幕，生成后即可预览漫画" />;
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: layout.pageGap,
        overflowX: 'auto',
        padding: '4px 0 8px'
      }}
    >
      {layout.pages.map((page) => (
        <div
          key={page.pageIndex}
          style={{
            position: 'relative',
            flex: '0 0 auto',
            width: page.width,
            height: page.height,
            background: '#fff',
            border: '1px solid #e5e7eb'
          }}
        >
          {page.panels.map((panel) => (
            <div
              key={panel.sceneId}
              style={{
                position: 'absolute',
                left: panel.x,
                top: panel.y,
                width: panel.width,
                height: panel.height,
                boxSizing: 'border-box',
                border: '2px solid #1f2937',
                background: '#f3f4f6',
                overflow: 'hidden'
              }}
            >
              {panel.imageUrl ? (
                <img
                  src={panel.imageUrl}
                  alt={panel.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    fontSize: 13
                  }}
                >
                  待生成
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  background: 'rgba(31, 41, 55, 0.75)',
                  color: '#fff',
                  fontSize: 11,
                  padding: '1px 6px'
                }}
              >
                幕 {panel.idx}
              </div>
              {panel.bubble ? (
                <div
                  style={{
                    position: 'absolute',
                    left: panel.bubble.x - panel.x,
                    top: panel.bubble.y - panel.y,
                    width: panel.bubble.width,
                    boxSizing: 'border-box',
                    height: panel.bubble.height,
                    overflow: 'hidden',
                    padding: panel.bubble.padding,
                    background: 'rgba(255, 255, 255, 0.94)',
                    border: '1px solid #1f2937',
                    color: '#111827',
                    fontSize: panel.bubble.fontSize,
                    lineHeight: `${panel.bubble.lineHeight}px`
                  }}
                >
                  {panel.bubble.lines.map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              fontSize: 12
            }}
          >
            {page.pageIndex + 1} / {layout.pages.length}
          </div>
        </div>
      ))}
    </div>
  );
};

export const GraphicPage: React.FC = () => {
  const [stories, setStories] = useState<GraphicStory[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [detail, setDetail] = useState<{ story: GraphicStory; scenes: GraphicScene[] } | null>(null);
  const [templates, setTemplates] = useState<PromptLibraryItem[]>([]);
  const [detailView, setDetailView] = useState<'comic' | 'scenes'>('comic');
  const [preset, setPreset] = useState<ComicPreset>('quad');
  const [showBubble, setShowBubble] = useState(true);
  const [exporting, setExporting] = useState(false);
  const msg = useApiMessage();

  // 折行估算与真实 canvas 绘制同源；浏览器不支持 2d 上下文时回退到 CJK 全宽估算。
  const comicMeasure = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    return (text: string, fontSize: number): number => {
      if (!ctx) {
        return estimateComicTextWidth(text, fontSize);
      }
      ctx.font = `${fontSize}px ${COMIC_FONT_FAMILY}`;
      return ctx.measureText(text).width;
    };
  }, []);

  const comicLayout = useMemo(
    () => layoutComic(detail?.scenes ?? [], { preset, showBubble, measureText: comicMeasure }),
    [detail, preset, showBubble, comicMeasure]
  );

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
    // 提示词模板只是可选项，拉取失败不阻断新建（留空即按风格兜底）。
    listPromptImages({ pageSize: 100 })
      .then((res) => setTemplates(res.items ?? []))
      .catch(() => undefined);
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
      msg.success('漫画故事已创建');
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
    try {
      await deleteGraphicStory(story.id);
      msg.success('已删除该漫画');
      setDetail(null);
      refresh();
    } catch {
      // http 层已统一提示
    }
  };

  const handleRegenerateScene = async (sceneId: number) => {
    if (!detail) {
      return;
    }
    try {
      await regenerateGraphicScene(detail.story.id, sceneId);
      msg.success('已开始重新生成该幕，其余幕会复用');
      refresh();
      setDetail(await getGraphicStory(detail.story.id));
    } catch {
      // http 层已统一提示
    }
  };

  const handleExport = async () => {
    if (!detail || comicLayout.pages.length === 0) {
      msg.warning('暂无可导出的漫画页');
      return;
    }
    setExporting(true);
    try {
      const result = await renderComicPng(comicLayout, detail.story.title);
      msg.success(`已导出 ${result.fileName}`);
    } catch (error) {
      msg.errorFrom(error, '导出漫画失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="AI 生成漫画"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建漫画
            </Button>
          </Space>
        }
      />

      {stories.length === 0 && !loading ? (
        <EmptyState description="还没有漫画，点击右上角新建，粘贴一段故事原文即可" />
      ) : (
        <Space direction="vertical" className="w-full" size={12}>
          {stories.map((story) => {
            return (
              <Card key={story.id} size="small" hoverable onClick={() => openDetail(story.id)}>
                <div className="flex justify-between items-center">
                  <Space>
                    <Typography.Text strong>{story.title}</Typography.Text>
                    {story.mode === 'anime' ? <Tag color="geekblue">动漫视频</Tag> : null}
                    <Tag>{STYLE_OPTIONS.find((o) => o.value === story.styleCategory)?.label ?? story.styleCategory}</Tag>
                    <StatusTag value={story.status} map={STATUS_META} fallback={STATUS_META.draft} />
                    {story.durationMs ? <Tag>{(story.durationMs / 1000).toFixed(1)}s</Tag> : null}
                  </Space>
                  <Space onClick={(e) => e.stopPropagation()}>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(story.id)}>
                      查看漫画
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
                    <ConfirmPopconfirm title="确定删除该漫画？删除后不可恢复" onConfirm={() => handleDelete(story)}>
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
        title="新建漫画故事"
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
                { value: 'graphic', label: '漫画（仅生图，可导出长图）' },
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
          <Form.Item name="styleCategory" label="画风" rules={[{ required: true, message: '请选择画风' }]} initialValue="illustrated">
            <Select options={STYLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="promptTemplateId" label="图片提示词模板" extra="留空按所选画风自动生成提示词">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="从提示词库选择（可选）"
              options={templates.map((item) => ({
                value: item.id,
                label: `${item.name}（${item.category}）`
              }))}
            />
          </Form.Item>
          <Form.Item
            name="sourceText"
            label="故事原文"
            rules={[{ required: true, message: '请输入故事原文' }]}
            extra="提交后由 LLM 自动分幕（3-8 幕），每幕生成一格漫画"
          >
            <Input.TextArea rows={6} maxLength={4000} showCount />
          </Form.Item>
        </SelfForm>
      </SelfModal>

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
                  {detail.story.mode === 'anime' ? '动漫视频' : '漫画'}
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
            <Space wrap className="mb-3">
              <Segmented
                value={detailView}
                onChange={(value) => setDetailView(value as 'comic' | 'scenes')}
                options={[
                  { label: '漫画预览', value: 'comic' },
                  { label: '分幕详情', value: 'scenes' }
                ]}
              />
              {detailView === 'comic' ? (
                <>
                  <Select
                    value={preset}
                    onChange={(value) => setPreset(value as ComicPreset)}
                    options={COMIC_PRESETS.map((item) => ({ value: item.value, label: item.label }))}
                    style={{ width: 120 }}
                  />
                  <Space size={4}>
                    <Typography.Text type="secondary" className="text-xs">对话气泡</Typography.Text>
                    <Switch size="small" checked={showBubble} onChange={setShowBubble} />
                  </Space>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    loading={exporting}
                    onClick={handleExport}
                  >
                    导出长图 PNG
                  </Button>
                </>
              ) : null}
            </Space>
            {detail.story.videoUrl ? (
              <Card size="small" title="成片" className="mb-4">
                <video src={detail.story.videoUrl} controls className="w-full max-h-[420px]" />
              </Card>
            ) : null}
            {detailView === 'comic' ? (
              <ComicPreview layout={comicLayout} />
            ) : detail.scenes.length === 0 ? (
              <EmptyState description="尚未分幕，点击生成开始" />
            ) : (
              <Space direction="vertical" className="w-full" size={12}>
                {detail.scenes.map((scene) => (
                  <Card key={scene.id} size="small">
                    <Space className="mb-2" wrap>
                      <Tag>幕 {scene.idx}</Tag>
                      <Typography.Text strong>{scene.name}</Typography.Text>
                      <StatusTag value={scene.status} map={SCENE_STATUS_META} fallback={{ label: scene.status, color: 'default' }} />
                      {scene.durationMs ? <Tag>{(scene.durationMs / 1000).toFixed(1)}s</Tag> : null}
                      <Button
                        size="small"
                        icon={<RedoOutlined />}
                        disabled={detail.story.status === 'running' || scene.status === 'running'}
                        onClick={() => handleRegenerateScene(scene.id)}
                      >
                        重生成此幕
                      </Button>
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
