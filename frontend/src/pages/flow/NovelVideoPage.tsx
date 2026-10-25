// 小说转视频页：导入小说 → 自动分片 → 一键生成分镜/图片/视频 → ffmpeg 合成成片。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message
} from 'antd';
import type { UploadFile } from 'antd';
import {
  BookOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { Permission } from '../../components/permission/Permission';
import {
  NovelProjectDetail,
  NovelProjectSummary,
  cancelNovelProject,
  createNovelProject,
  deleteNovelProject,
  getNovelProject,
  listNovelProjects,
  reSplitNovelProject,
  runNovelProject
} from '../../api/novelVideo';
import { formatDuration } from './flowRunUI';
import './flow-pages.css';

const PROJECT_STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: '待生成', color: 'default' },
  running: { label: '生成中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' }
};

const SHOT_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待生成', color: 'default' },
  image_done: { label: '已出图', color: 'blue' },
  video_done: { label: '已出片', color: 'success' },
  failed: { label: '失败', color: 'error' }
};

interface CreateFormValues {
  name: string;
  text: string;
  stylePrompt?: string;
  shotsPerChapter: number;
  videoSeconds: number;
}

export const NovelVideoPage: React.FC = () => {
  const { message: antMessage } = AntApp.useApp();
  const [projects, setProjects] = useState<NovelProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<NovelProjectDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form] = Form.useForm<CreateFormValues>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const detailIdRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setProjects(await listNovelProjects());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 列表存在运行中项目时轮询刷新。
  const hasRunning = useMemo(
    () => projects.some((project) => project.status === 'running'),
    [projects]
  );
  useEffect(() => {
    if (!hasRunning) {
      return;
    }
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [hasRunning, load]);

  const openDetail = useCallback(async (id: number) => {
    detailIdRef.current = id;
    setDetailOpen(true);
    try {
      setDetail(await getNovelProject(id));
    } catch (error) {
      antMessage.error(error instanceof Error ? error.message : '加载失败');
    }
  }, [antMessage]);

  // 详情抽屉打开且项目运行中：轮询进度。
  useEffect(() => {
    if (!detailOpen || detail?.project.status !== 'running') {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const fresh = await getNovelProject(detail.project.id);
        if (detailIdRef.current === detail.project.id) {
          setDetail(fresh);
        }
        if (fresh.project.status !== 'running') {
          void load();
        }
      } catch {
        // 忽略轮询错误
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [detailOpen, detail, load]);

  const readFileText = useCallback(async (file: UploadFile): Promise<boolean> => {
    const origin = file.originFileObj;
    if (!origin) {
      return false;
    }
    const text = await origin.text();
    form.setFieldsValue({ text, name: form.getFieldValue('name') || origin.name.replace(/\.txt$/i, '').slice(0, 40) });
    antMessage.success(`已导入 ${origin.name}（${text.length} 字）`);
    return false; // 阻止 antd 自动上传
  }, [antMessage, form]);

  const submitCreate = useCallback(async () => {
    const values = await form.validateFields();
    setCreating(true);
    try {
      const created = await createNovelProject({
        name: values.name,
        text: values.text,
        stylePrompt: values.stylePrompt,
        config: { shotsPerChapter: values.shotsPerChapter, videoSeconds: values.videoSeconds }
      });
      antMessage.success(`已创建并切分为 ${created.chapters.length} 个章节`);
      setCreateOpen(false);
      form.resetFields();
      setFileList([]);
      await load();
      await openDetail(created.project.id);
    } finally {
      setCreating(false);
    }
  }, [form, load, openDetail, antMessage]);

  const run = useCallback(
    async (id: number) => {
      try {
        await runNovelProject(id);
        antMessage.success('已开始生成：分镜 → 出图 → 出视频 → 合成，可在详情里看进度');
        if (detailIdRef.current === id) {
          setDetail(await getNovelProject(id));
        }
        await load();
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '启动失败');
      }
    },
    [antMessage, load]
  );

  const cancel = useCallback(
    async (id: number) => {
      try {
        await cancelNovelProject(id);
        antMessage.success('已请求取消');
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '取消失败');
      }
    },
    [antMessage]
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await deleteNovelProject(id);
        antMessage.success('已删除');
        if (detailIdRef.current === id) {
          setDetailOpen(false);
        }
        await load();
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '删除失败');
      }
    },
    [antMessage, load]
  );

  const reSplit = useCallback(
    async (id: number) => {
      try {
        const fresh = await reSplitNovelProject(id);
        antMessage.success(`已重新切分为 ${fresh.chapters.length} 个章节`);
        setDetail(fresh);
        await load();
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '重新分片失败');
      }
    },
    [antMessage, load]
  );

  const shotsByChapter = useMemo(() => {
    const map = new Map<number, NovelProjectDetail['shots']>();
    detail?.shots.forEach((shot) => {
      const list = map.get(shot.chapterId) ?? [];
      list.push(shot);
      map.set(shot.chapterId, list);
    });
    return map;
  }, [detail]);

  return (
    <div>
      <div className="flow-page-header">
        <Typography.Title level={4} className="flow-page-header-title">
          小说转视频
        </Typography.Title>
        <Typography.Text className="flow-page-header-desc">
          导入小说自动分片，逐章生成分镜、首帧图与视频片段，最后合成成片——一键完成
        </Typography.Text>
        <span className="flow-page-header-spacer" />
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
        <Permission code="flow:define:manage">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            导入小说
          </Button>
        </Permission>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin />
        </div>
      ) : projects.length === 0 ? (
        <Empty description="还没有项目，导入一段小说开始" style={{ padding: 60 }} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
            gap: 16
          }}
        >
          {projects.map((project) => {
            const meta = PROJECT_STATUS_META[project.status] ?? { label: project.status, color: 'default' };
            return (
              <Card key={project.id} hoverable styles={{ body: { padding: 16 } }} onClick={() => void openDetail(project.id)}>
                <Space size={6} wrap>
                  <BookOutlined style={{ fontSize: 18, color: 'var(--brand-primary)' }} />
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    {project.name}
                  </Typography.Text>
                  <Tag color={meta.color}>{meta.label}</Tag>
                </Space>
                <Typography.Paragraph type="secondary" ellipsis={{ rows: 1 }} style={{ margin: '8px 0 6px', fontSize: 12 }}>
                  {project.stageMessage ?? project.error ?? '—'}
                </Typography.Paragraph>
                {project.totalShots > 0 && (
                  <Progress
                    percent={Math.round((project.doneShots / project.totalShots) * 100)}
                    size="small"
                    status={project.status === 'failed' ? 'exception' : 'normal'}
                  />
                )}
                <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 6 }}>
                  {project.totalShots > 0 ? `分镜 ${project.doneShots}/${project.totalShots}` : '尚未生成分镜'}
                  {project.durationMs ? ` · 总耗时 ${formatDuration(project.durationMs)}` : ''}
                </div>
                <div className="flow-card-actions">
                  <Space size={4} wrap>
                    {project.status === 'running' ? (
                      <Permission code="flow:run:execute">
                        <Button size="small" danger icon={<StopOutlined />} onClick={() => void cancel(project.id)}>
                          取消
                        </Button>
                      </Permission>
                    ) : (
                      <Permission code="flow:run:execute">
                        <Button
                          size="small"
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          onClick={() => void run(project.id)}
                        >
                          {project.totalShots > 0 ? '重新生成' : '一键生成'}
                        </Button>
                      </Permission>
                    )}
                    {project.finalVideoPath && (
                      <Button size="small" icon={<PlayCircleOutlined />} onClick={() => void openDetail(project.id)}>
                        看成片
                      </Button>
                    )}
                  </Space>
                  <Permission code="flow:define:manage">
                    <Popconfirm title="删除项目及其全部产物？" onConfirm={() => void remove(project.id)} okText="删除" cancelText="取消">
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Permission>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title="导入小说"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        okText="创建并分片"
        confirmLoading={creating}
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ shotsPerChapter: 3, videoSeconds: 5 }}>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：星际橘猫 第一集" maxLength={64} />
          </Form.Item>
          <Form.Item label="小说文本（粘贴或上传 txt）" required>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Upload
                accept=".txt"
                maxCount={1}
                fileList={fileList}
                beforeUpload={(_file, list) => {
                  void readFileText(list[0] ?? _file);
                  return false;
                }}
                onRemove={() => setFileList([])}
                onChange={({ fileList: files }) => setFileList(files)}
              >
                <Button icon={<UploadOutlined />}>选择 .txt 文件</Button>
              </Upload>
              <Form.Item name="text" noStyle rules={[{ required: true, message: '请粘贴小说文本或上传 txt' }]}>
                <Input.TextArea
                  rows={8}
                  placeholder="粘贴小说全文或章节片段…（自动按「第X章」切分；无章节标记时按段落长度切分，最多 50 片）"
                  showCount
                  maxLength={200000}
                />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="stylePrompt" label="全片风格提示词（可选）">
            <Input placeholder="如：宫崎骏水彩画风，柔和光影，电影感" maxLength={200} />
          </Form.Item>
          <Space size="large">
            <Form.Item name="shotsPerChapter" label="每章分镜数">
              <InputNumber min={1} max={6} />
            </Form.Item>
            <Form.Item name="videoSeconds" label="单镜时长（秒）">
              <Select
                style={{ width: 100 }}
                options={[
                  { value: 5, label: '5 秒' },
                  { value: 10, label: '10 秒' }
                ]}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Drawer
        title={detail ? `项目：${detail.project.name}` : '项目详情'}
        width={720}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        destroyOnHidden
        extra={
          detail && (
            <Space>
              {detail.project.status === 'running' ? (
                <Permission code="flow:run:execute">
                  <Button size="small" danger icon={<StopOutlined />} onClick={() => void cancel(detail.project.id)}>
                    取消
                  </Button>
                </Permission>
              ) : (
                <Permission code="flow:run:execute">
                  <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => void run(detail.project.id)}>
                    {detail.progress.total > 0 ? '续跑/重跑' : '一键生成'}
                  </Button>
                </Permission>
              )}
              <Permission code="flow:define:manage">
                <Popconfirm
                  title="重新分片将清空已有分镜与产物，确认？"
                  onConfirm={() => void reSplit(detail.project.id)}
                  okText="重新分片"
                  cancelText="取消"
                >
                  <Button size="small">重新分片</Button>
                </Popconfirm>
              </Permission>
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Space size={8} wrap style={{ marginBottom: 12 }}>
              <Tag color={PROJECT_STATUS_META[detail.project.status]?.color}>
                {PROJECT_STATUS_META[detail.project.status]?.label ?? detail.project.status}
              </Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {detail.project.stageMessage ?? detail.project.error ?? `共 ${detail.chapters.length} 章 · ${detail.progress.total} 个分镜`}
              </Typography.Text>
            </Space>
            <Progress
              percent={detail.progress.total > 0 ? Math.round((detail.progress.done / detail.progress.total) * 100) : 0}
              size="small"
              status={detail.progress.failed > 0 ? 'exception' : 'normal'}
            />
            {detail.project.finalVideoPath && (
              <div style={{ margin: '16px 0' }}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  成片
                </Typography.Title>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={detail.project.finalVideoPath} controls style={{ width: '100%', borderRadius: 12 }} />
              </div>
            )}
            {detail.chapters.map((chapter) => (
              <Card key={chapter.id} size="small" title={`${chapter.idx}. ${chapter.title}`} style={{ marginTop: 12 }}
                extra={
                  <Tag color={chapter.status === 'storyboarded' ? 'success' : chapter.status === 'failed' ? 'error' : 'default'}>
                    {chapter.status === 'storyboarded' ? '已分镜' : chapter.status === 'failed' ? '分镜失败' : '待分镜'}
                  </Tag>
                }
              >
                {chapter.error && (
                  <Typography.Paragraph type="danger" style={{ fontSize: 12, marginBottom: 8 }}>
                    {chapter.error}
                  </Typography.Paragraph>
                )}
                {(shotsByChapter.get(chapter.id) ?? []).map((shot) => {
                  const shotMeta = SHOT_STATUS_META[shot.status] ?? { label: shot.status, color: 'default' };
                  return (
                    <div
                      key={shot.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '8px 0',
                        borderTop: '1px solid var(--panel-border)',
                        alignItems: 'flex-start'
                      }}
                    >
                      <div style={{ width: 96, height: 64, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--app-bg)' }}>
                        {shot.imageUrl ? (
                          <Image src={shot.imageUrl} width={96} height={64} style={{ objectFit: 'cover' }} />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bbb', fontSize: 12 }}>
                            无图
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space size={6} wrap>
                          <Tag color={shotMeta.color} style={{ marginRight: 0 }}>
                            #{shot.idx} {shotMeta.label}
                          </Tag>
                          {shot.durationMs ? (
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                              {formatDuration(shot.durationMs)}
                            </Typography.Text>
                          ) : null}
                        </Space>
                        <Typography.Paragraph style={{ margin: '4px 0', fontSize: 12 }} ellipsis={{ rows: 2 }}>
                          {shot.narration || shot.motionPrompt}
                        </Typography.Paragraph>
                        {shot.error && (
                          <Typography.Text type="danger" style={{ fontSize: 11 }}>
                            {shot.error}
                          </Typography.Text>
                        )}
                      </div>
                      {shot.videoUrl && (
                        <a href={shot.videoUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                          看片段
                        </a>
                      )}
                    </div>
                  );
                })}
              </Card>
            ))}
          </>
        )}
      </Drawer>
    </div>
  );
};
