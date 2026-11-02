// 小说转视频页：导入小说 → 自动分片 → 一键生成分镜/图片/视频 → ffmpeg 合成成片。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  Dropdown,
  Form,
  Image,
  Input,
  InputNumber,
  Popconfirm,
  Progress,
  Select,
  Slider,
  Space,
  Spin,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { MenuProps } from 'antd';
import type { UploadFile } from 'antd';
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SoundOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';
import { Permission } from '../../components/permission/Permission';
import { SelfDrawer } from '../../components/base/SelfDrawer';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { ConfirmPopconfirm } from '../../components/business/ConfirmAction';
import { EmptyState } from '../../components/business/PagePanel';
import { PageHeader } from '../../components/business/PageHeader';
import { StatusTag } from '../../components/business/StatusTag';
import type { StatusMeta } from '../../types/ui';
import {
  NovelProjectDetail,
  NovelProjectSummary,
  NovelShotRegenerateStep,
  NovelShotVo,
  cancelNovelProject,
  createNovelProject,
  deleteNovelProject,
  deleteCharacterCard,
  generateNovelSubtitle,
  getNovelProject,
  listCharacterCards,
  listNovelProjects,
  reSplitNovelProject,
  regenerateNovelShot,
  replanNovelShot,
  runNovelProject,
  updateNovelProject
} from '../../api/novelVideo';
import type { CharacterCardVo } from '../../api/novelVideo';
import { CharacterCardModal } from './CharacterCardModal';
import { CoverComposerModal } from './CoverComposerModal';
import { NovelShotEditModal } from './NovelShotEditModal';
import { uploadAudioFile } from '../../api/files';
import { formatDuration } from './flowRunUI';
import './flow-pages.css';

const PROJECT_STATUS_META: Record<string, StatusMeta> = {
  draft: { label: '待生成', color: 'default' },
  running: { label: '生成中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' }
};

const SHOT_STATUS_META: Record<string, StatusMeta> = {
  pending: { label: '待生成', color: 'default' },
  image_done: { label: '已出图', color: 'blue' },
  audio_done: { label: '已配音', color: 'geekblue' },
  video_done: { label: '已出片', color: 'success' },
  failed: { label: '失败', color: 'error' }
};

interface CreateFormValues {
  name: string;
  text: string;
  stylePrompt?: string;
  shotsPerChapter: number;
  videoSeconds: number;
  aspect: '16:9' | '9:16' | '1:1';
}

// 多规格画幅选项：贯穿生图 size 与合成端 mux/视觉步目标分辨率（缺省 16:9）。
const ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9 横屏（1280x720）' },
  { value: '9:16', label: '9:16 竖屏（720x1280）' },
  { value: '1:1', label: '1:1 方形（720x720）' }
];

// 字幕烧录样式预设档（后端 subtitleStylePreset 同名三档）。
const SUBTITLE_STYLE_OPTIONS = [
  { value: 'default', label: '标准字幕（白字黑边 20px）' },
  { value: 'big', label: '大字字幕（白字黑边 34px）' },
  { value: 'none', label: '不烧录字幕' }
];

// 项目配置表单值（保存时整体走 updateNovelProject 的 config 浅合并）。
interface ConfigFormValues {
  aspect: '16:9' | '9:16' | '1:1';
  bgmUrl: string;
  subtitleStyle: 'default' | 'big' | 'none';
  bgmVolume: number;
}

// BGM 上传限制（与后端 upload-audio 端点一致：mp3/wav + 10MB）。
const BGM_MAX_SIZE = 10 * 1024 * 1024;
const BGM_ALLOWED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'];

export const NovelVideoPage: React.FC = () => {
  const { message: antMessage, modal } = AntApp.useApp();
  const [projects, setProjects] = useState<NovelProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<NovelProjectDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form] = Form.useForm<CreateFormValues>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  // 项目配置表单（详情抽屉「项目配置」Card）：画幅 / BGM / 字幕样式 / BGM 音量。
  const [configForm] = Form.useForm<ConfigFormValues>();
  const [savingConfig, setSavingConfig] = useState(false);
  const [bgmUploading, setBgmUploading] = useState(false);
  // BGM 展示与音量 label 的响应式值（useWatch 随字段更新重渲染）。
  const bgmUrl = Form.useWatch('bgmUrl', configForm) ?? '';
  const bgmVolumeDisplay = ((Form.useWatch('bgmVolume', configForm) ?? 0.2) as number).toFixed(2);
  const detailIdRef = useRef<number | null>(null);
  // 单镜编辑弹窗（非 null 即打开）与字幕重生成 loading。
  const [editingShot, setEditingShot] = useState<NovelShotVo | null>(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  // 封面合成弹窗：coverProject 非空即打开；shots 由打开时拉取的 detail 提供（底图候选）。
  const [coverProject, setCoverProject] = useState<{ id: number; name: string } | null>(null);
  const [coverShots, setCoverShots] = useState<NovelShotVo[]>([]);
  // 角色库：详情抽屉内列表 + 新建/编辑弹窗（editingCharacter null = 新建）。
  const [characters, setCharacters] = useState<CharacterCardVo[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [characterModalOpen, setCharacterModalOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterCardVo | null>(null);

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

  // 角色列表：打开详情与增删改后刷新。
  const loadCharacters = useCallback(
    async (projectId: number) => {
      setCharactersLoading(true);
      try {
        setCharacters(await listCharacterCards(projectId));
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '角色加载失败');
      } finally {
        setCharactersLoading(false);
      }
    },
    [antMessage]
  );

  const openDetail = useCallback(async (id: number) => {
    detailIdRef.current = id;
    setDetailOpen(true);
    setCharacters([]);
    void loadCharacters(id);
    try {
      setDetail(await getNovelProject(id));
    } catch (error) {
      antMessage.error(error instanceof Error ? error.message : '加载失败');
    }
  }, [antMessage, loadCharacters]);

  // 项目配置表单与 detail 同步（打开抽屉/保存回读/轮询刷新都重置为服务端值）。
  useEffect(() => {
    if (!detail) {
      return;
    }
    configForm.setFieldsValue({
      aspect: detail.project.config.aspect ?? '16:9',
      bgmUrl: detail.project.config.bgmUrl ?? '',
      subtitleStyle: (detail.project.config.subtitleStyle as ConfigFormValues['subtitleStyle']) ?? 'default',
      bgmVolume: detail.project.config.bgmVolume ?? 0.2
    });
  }, [detail, configForm]);

  // 保存项目配置：只传配置表单字段，后端 {...project.config, ...dto.config} 浅合并。
  const saveConfig = useCallback(
    async (projectId: number) => {
      const values = await configForm.validateFields();
      setSavingConfig(true);
      try {
        const fresh = await updateNovelProject(projectId, { config: values });
        setDetail(fresh);
        setProjects((prev) =>
          prev.map((project) => (project.id === projectId ? { ...project, stageMessage: fresh.project.stageMessage ?? project.stageMessage } : project))
        );
        antMessage.success('项目配置已保存，下次生成/合成生效');
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '配置保存失败');
      } finally {
        setSavingConfig(false);
      }
    },
    [configForm, antMessage]
  );

  // BGM 上传：beforeUpload 双重校验（类型 + ≤10MB，与后端 upload-audio 一致）后手动上传，
  // 成功回填 bgmUrl（记得点保存）；返回 false 阻止 antd 自动上传。
  const handleBgmUpload = useCallback(
    async (file: File) => {
      if (file.type && !BGM_ALLOWED_TYPES.includes(file.type)) {
        antMessage.error('BGM 仅支持 mp3/wav');
        return false;
      }
      if (file.size > BGM_MAX_SIZE) {
        antMessage.error('BGM 不能超过 10MB');
        return false;
      }
      setBgmUploading(true);
      try {
        const uploaded = await uploadAudioFile(file);
        configForm.setFieldsValue({ bgmUrl: uploaded.url });
        antMessage.success('BGM 已上传，请点「保存」生效');
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '上传失败');
      } finally {
        setBgmUploading(false);
      }
      return false;
    },
    [configForm, antMessage]
  );

  // 封面合成：拉项目 detail 取分镜（底图候选），coverProject 非空即打开弹窗。
  const openCover = useCallback(
    async (id: number) => {
      try {
        const fresh = await getNovelProject(id);
        setCoverShots(fresh.shots);
        setCoverProject({ id: fresh.project.id, name: fresh.project.name });
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '加载失败');
      }
    },
    [antMessage]
  );

  // 封面已保存：同步卡片墙与详情（列表 summary 与 detail.project 都有 coverUrl）。
  const coverSaved = useCallback(
    (coverUrl: string) => {
      setCoverProject(null);
      antMessage.success('封面已保存');
      setProjects((prev) =>
        prev.map((project) => (project.id === (coverProject?.id ?? -1) ? { ...project, coverUrl } : project))
      );
      setDetail((prev) =>
        prev && prev.project.id === coverProject?.id ? { ...prev, project: { ...prev.project, coverUrl } } : prev
      );
    },
    [antMessage, coverProject]
  );

  // 封面弹窗错误提示：useCallback 固化引用——本页 hasRunning 时每 5s 轮询重渲染，
  // 内联箭头函数会让 CoverComposerModal 依赖 onError 的 effect 反复重跑。
  const coverOnError = useCallback(
    (error: unknown) => antMessage.error(error instanceof Error ? error.message : '封面生成失败'),
    [antMessage]
  );

  // 角色删除（ConfirmPopconfirm 确认后）：刷新列表；不删除已上传文件（孤儿文件可接受，v1 从简）。
  const removeCharacter = useCallback(
    async (character: CharacterCardVo) => {
      try {
        await deleteCharacterCard(character.id);
        antMessage.success('角色已删除');
        if (detailIdRef.current) {
          await loadCharacters(detailIdRef.current);
        }
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '删除失败');
      }
    },
    [antMessage, loadCharacters]
  );

  // 角色保存成功（新建/编辑）：关弹窗刷新列表。
  const characterSaved = useCallback(() => {
    setCharacterModalOpen(false);
    antMessage.success('角色已保存');
    if (detailIdRef.current) {
      void loadCharacters(detailIdRef.current);
    }
  }, [antMessage, loadCharacters]);

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
        config: { shotsPerChapter: values.shotsPerChapter, videoSeconds: values.videoSeconds, aspect: values.aspect }
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

  // 单镜产物/配置变化：只替换 detail 里对应分镜（避免整页 refetch 打断抽屉浏览）。
  const applyShot = useCallback((updated: NovelShotVo) => {
    setDetail((prev) =>
      prev ? { ...prev, shots: prev.shots.map((shot) => (shot.id === updated.id ? updated : shot)) } : prev
    );
  }, []);

  const shotSaved = useCallback(
    (updated: NovelShotVo) => {
      applyShot(updated);
      setEditingShot(null);
      antMessage.success('分镜配置已保存');
    },
    [applyShot, antMessage]
  );

  // AI 重新规划：重写画面/运动提示词（旁白锁定时保持原文），产物状态回到待生成。
  const replan = useCallback(
    (projectId: number, shot: NovelShotVo) => {
      const narrationLocked = Boolean((shot.lockedSourceText ?? '').trim());
      modal.confirm({
        title: `AI 重新规划分镜 #${shot.idx}？`,
        content: narrationLocked
          ? '已锁定原文：只优化画面与镜头运动，旁白保持原文不改写。'
          : '将用 LLM 重写画面/运动提示词与旁白，产物状态回到待生成。',
        okText: '重新规划',
        cancelText: '取消',
        onOk: async () => {
          try {
            applyShot(await replanNovelShot(projectId, shot.id));
            antMessage.success('已重新规划，产物待重做');
          } catch (error) {
            antMessage.error(error instanceof Error ? error.message : '重新规划失败');
          }
        }
      });
    },
    [applyShot, antMessage, modal]
  );

  const regenerate = useCallback(
    async (projectId: number, shot: NovelShotVo, step: NovelShotRegenerateStep) => {
      try {
        applyShot(await regenerateNovelShot(projectId, shot.id, step));
        antMessage.success(
          step === 'image' ? '首帧图已重新生成' : step === 'video' ? '视频片段已重新生成' : '配音已生成'
        );
        void load(); // 单镜状态影响项目进度统计
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '重新生成失败');
      }
    },
    [applyShot, antMessage, load]
  );

  // 重生成菜单：首帧（锁定时禁用）/视频/配音（audio_done 状态镜头用「补配音」不回退状态）。
  const regenerateMenu = useCallback(
    (projectId: number, shot: NovelShotVo): MenuProps => ({
      items: [
        {
          key: 'image',
          icon: <PictureOutlined />,
          disabled: Boolean(shot.firstFrameLocked && shot.imageUrl),
          label: <span title={shot.firstFrameLocked && shot.imageUrl ? '首帧已锁定，请先在编辑里解锁' : undefined}>重出首帧图</span>
        },
        { key: 'video', icon: <VideoCameraOutlined />, label: '重出视频片段' },
        { key: 'audio', icon: <SoundOutlined />, label: '补配音' }
      ],
      onClick: ({ key }) => void regenerate(projectId, shot, key as NovelShotRegenerateStep)
    }),
    [regenerate]
  );

  const regenerateSubtitle = useCallback(
    async (projectId: number) => {
      setSubtitleLoading(true);
      try {
        const { subtitlePath } = await generateNovelSubtitle(projectId);
        setDetail((prev) => (prev && prev.project.id === projectId ? { ...prev, project: { ...prev.project, finalSubtitlePath: subtitlePath } } : prev));
        antMessage.success('字幕已重新生成');
      } catch (error) {
        antMessage.error(error instanceof Error ? error.message : '字幕生成失败');
      } finally {
        setSubtitleLoading(false);
      }
    },
    [antMessage]
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
      {/* flow-page-header 自绘 flex 迁 PageHeader（README 收编写法） */}
      <PageHeader
        className="flex-wrap gap-y-1"
        title="小说转视频"
        subtitle="导入小说自动分片，逐章生成分镜、首帧图与视频片段，最后合成成片——一键完成"
        actions={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
            <Permission code="flow:define:manage">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                导入小说
              </Button>
            </Permission>
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState description="还没有项目，导入一段小说开始" className="py-15" />
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))]">
          {projects.map((project) => {
            return (
              <Card key={project.id} hoverable styles={{ body: { padding: 16 } }} onClick={() => void openDetail(project.id)}>
                {/* 封面：有图展示 + 重新生成；无图虚线占位入口（无权限不渲染，Permission hide 模式） */}
                <div className="mb-2">
                  {project.coverUrl ? (
                    <div className="relative">
                      <img src={project.coverUrl} alt={`${project.name} 封面`} className="h-36 w-full rounded-lg object-cover" />
                      <Permission code="flow:define:manage">
                        <Button
                          size="small"
                          className="absolute right-2 top-2"
                          icon={<PictureOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openCover(project.id);
                          }}
                        >
                          重新生成
                        </Button>
                      </Permission>
                    </div>
                  ) : (
                    <Permission code="flow:define:manage">
                      <button
                        type="button"
                        className="flex h-36 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--panel-border)] text-xs text-[#999] transition-colors hover:border-primary hover:text-primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openCover(project.id);
                        }}
                      >
                        <PictureOutlined className="text-lg" />
                        生成封面
                      </button>
                    </Permission>
                  )}
                </div>
                <Space size={6} wrap>
                  <BookOutlined className="text-lg text-primary" />
                  <Typography.Text strong className="text-[15px]">
                    {project.name}
                  </Typography.Text>
                  <StatusTag value={project.status} map={PROJECT_STATUS_META} fallback={{ label: project.status, color: 'default' }} />
                </Space>
                <Typography.Paragraph type="secondary" ellipsis={{ rows: 1 }} className="mt-2 !mb-1.5 text-xs">
                  {project.stageMessage ?? project.error ?? '—'}
                </Typography.Paragraph>
                {project.totalShots > 0 && (
                  <Progress
                    percent={Math.round((project.doneShots / project.totalShots) * 100)}
                    size="small"
                    status={project.status === 'failed' ? 'exception' : 'normal'}
                  />
                )}
                <div className="text-xs text-text-sub mt-1.5">
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
                    <ConfirmPopconfirm title="删除项目及其全部产物？" onConfirm={() => void remove(project.id)} okText="删除" cancelText="取消">
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </ConfirmPopconfirm>
                  </Permission>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SelfModal
        title="导入小说"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        okText="创建并分片"
        confirmLoading={creating}
        width="md"
        destroyOnHidden
      >
        <SelfForm form={form} initialValues={{ shotsPerChapter: 3, videoSeconds: 5, aspect: '16:9' }}>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：星际橘猫 第一集" maxLength={64} />
          </Form.Item>
          <Form.Item label="小说文本（粘贴或上传 txt）" required>
            <Space direction="vertical" className="w-full" size={8}>
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
                className="w-[100px]"
                options={[
                  { value: 5, label: '5 秒' },
                  { value: 10, label: '10 秒' }
                ]}
              />
            </Form.Item>
          </Space>
          {/* 成片画幅：贯穿生图 size 与合成端分辨率；详情「项目配置」可随时改。 */}
          <Form.Item name="aspect" label="成片画幅">
            <Select className="w-[220px]" options={ASPECT_OPTIONS} />
          </Form.Item>
        </SelfForm>
      </SelfModal>

      {/* width=720 即 SelfDrawer lg 档 */}
      <SelfDrawer
        title={detail ? `项目：${detail.project.name}` : '项目详情'}
        width="lg"
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
                <ConfirmPopconfirm
                  title="重新分片将清空已有分镜与产物，确认？"
                  onConfirm={() => void reSplit(detail.project.id)}
                  okText="重新分片"
                  cancelText="取消"
                >
                  <Button size="small">重新分片</Button>
                </ConfirmPopconfirm>
              </Permission>
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Space size={8} wrap className="mb-3">
              <StatusTag
                value={detail.project.status}
                map={PROJECT_STATUS_META}
                fallback={{ label: detail.project.status, color: 'default' }}
              />
              <Typography.Text type="secondary" className="text-xs">
                {detail.project.stageMessage ?? detail.project.error ?? `共 ${detail.chapters.length} 章 · ${detail.progress.total} 个分镜`}
              </Typography.Text>
              {/* 字幕路径后端已存 /uploads/... 完整静态路径，直接用，不做前缀拼接 */}
              {detail.project.finalSubtitlePath && (
                <a href={detail.project.finalSubtitlePath} download className="text-xs">
                  下载字幕（SRT）
                </a>
              )}
              {detail.progress.done > 0 && (
                <Permission code="flow:run:execute">
                  <Button size="small" type="link" loading={subtitleLoading} onClick={() => void regenerateSubtitle(detail.project.id)}>
                    重新生成字幕
                  </Button>
                </Permission>
              )}
            </Space>
            <Progress
              percent={detail.progress.total > 0 ? Math.round((detail.progress.done / detail.progress.total) * 100) : 0}
              size="small"
              status={detail.progress.failed > 0 ? 'exception' : 'normal'}
            />
            {detail.project.coverUrl && (
              <div className="my-4">
                <Space size={8} className="!mb-2">
                  <Typography.Title level={5} className="!my-0">
                    封面
                  </Typography.Title>
                  <Permission code="flow:define:manage">
                    <Button
                      size="small"
                      type="link"
                      icon={<PictureOutlined />}
                      onClick={() => void openCover(detail.project.id)}
                    >
                      重新生成
                    </Button>
                  </Permission>
                </Space>
                <div>
                  <img src={detail.project.coverUrl} alt={`${detail.project.name} 封面`} className="max-h-64 rounded-lg" />
                </div>
              </div>
            )}
            {detail.project.finalVideoPath && (
              <div className="my-4">
                <Typography.Title level={5} className="!mt-0">
                  成片
                </Typography.Title>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={detail.project.finalVideoPath} controls className="w-full rounded-lg" />
              </div>
            )}
            {/* 项目配置：多规格画幅 / BGM（ducking 混音）/ 字幕烧录样式 / BGM 音量，保存后下次合成生效 */}
            <Card
              size="small"
              title="项目配置"
              className="mt-3"
              extra={
                <Permission code="flow:define:manage">
                  <Button size="small" type="primary" loading={savingConfig} onClick={() => void saveConfig(detail.project.id)}>
                    保存
                  </Button>
                </Permission>
              }
            >
              <SelfForm form={configForm} layout="vertical">
                <Space size="large" wrap>
                  <Form.Item name="aspect" label="成片画幅" className="!mb-2">
                    <Select className="w-[220px]" options={ASPECT_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="subtitleStyle" label="字幕样式" className="!mb-2">
                    <Select className="w-[200px]" options={SUBTITLE_STYLE_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="bgmVolume" label={`BGM 音量（${bgmVolumeDisplay}）`} className="!mb-2">
                    <Slider className="w-[160px]" min={0} max={1} step={0.05} />
                  </Form.Item>
                </Space>
                <Form.Item label="背景音乐 BGM（合成时自动 ducking 压低垫乐）" className="!mb-0">
                  <Space size={8} wrap>
                    {/* bgmUrl 实际值存这里（hidden 字段）；上传成功回填，清除按钮置空串（后端空串 = 不加 BGM） */}
                    <Form.Item name="bgmUrl" hidden>
                      <Input />
                    </Form.Item>
                    {!bgmUrl ? (
                      <Permission code="flow:define:manage">
                        <Upload
                          accept=".mp3,.wav"
                          showUploadList={false}
                          beforeUpload={(file) => {
                            void handleBgmUpload(file);
                            return false;
                          }}
                        >
                          <Button size="small" icon={<UploadOutlined />} loading={bgmUploading}>
                            上传 BGM（mp3/wav，≤10MB）
                          </Button>
                        </Upload>
                      </Permission>
                    ) : (
                      <>
                        <a href={bgmUrl} target="_blank" rel="noreferrer" className="text-xs">
                          听当前 BGM
                        </a>
                        <Permission code="flow:define:manage">
                          <Space size={4}>
                            <Upload
                              accept=".mp3,.wav"
                              showUploadList={false}
                              beforeUpload={(file) => {
                                void handleBgmUpload(file);
                                return false;
                              }}
                            >
                              <Button size="small" icon={<UploadOutlined />} loading={bgmUploading}>
                                更换
                              </Button>
                            </Upload>
                            <Button size="small" icon={<DeleteOutlined />} onClick={() => configForm.setFieldsValue({ bgmUrl: '' })}>
                              清除
                            </Button>
                          </Space>
                        </Permission>
                      </>
                    )}
                  </Space>
                </Form.Item>
              </SelfForm>
            </Card>
            {/* 角色库：分镜出图自动注入角色外观与参考图，保证多镜头同一角色形象 */}
            <Card
              size="small"
              title="角色库"
              loading={charactersLoading && characters.length === 0}
              className="mt-3"
              extra={
                <Permission code="flow:define:manage">
                  <Button
                    size="small"
                    type="link"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingCharacter(null);
                      setCharacterModalOpen(true);
                    }}
                  >
                    新建角色
                  </Button>
                </Permission>
              }
            >
              {characters.length === 0 && !charactersLoading ? (
                <Typography.Text type="secondary" className="text-xs">
                  还没有角色。建角色卡（外观描述 + 参考图）后，出图自动注入保持角色一致。
                </Typography.Text>
              ) : (
                characters.map((character) => (
                  <div
                    key={character.id}
                    className="flex items-center gap-3 border-t border-[var(--panel-border)] py-2 first:border-t-0"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--app-bg)]">
                      {character.referenceImages[0] ? (
                        <Image src={character.referenceImages[0]} width={48} height={48} style={{ objectFit: 'cover' }} />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-[#bbb]">无图</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Space size={6} wrap>
                        <Typography.Text strong>{character.name}</Typography.Text>
                        {character.isPrimary && (
                          <Tag color="gold" className="!mr-0">
                            主角色
                          </Tag>
                        )}
                        <Typography.Text type="secondary" className="text-[11px]">
                          {character.referenceImages.length > 0 ? `${character.referenceImages.length} 张参考图` : '无参考图'}
                        </Typography.Text>
                      </Space>
                      <Typography.Paragraph type="secondary" className="mt-0.5 !mb-0 text-xs" ellipsis={{ rows: 1 }}>
                        {character.appearance || '—'}
                      </Typography.Paragraph>
                    </div>
                    <Permission code="flow:define:manage">
                      <Space size={4}>
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditingCharacter(character);
                            setCharacterModalOpen(true);
                          }}
                        >
                          编辑
                        </Button>
                        <ConfirmPopconfirm
                          title={`删除角色「${character.name}」？已生成的分镜图不受影响`}
                          onConfirm={() => void removeCharacter(character)}
                          okText="删除"
                          cancelText="取消"
                        >
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </ConfirmPopconfirm>
                      </Space>
                    </Permission>
                  </div>
                ))
              )}
            </Card>
            {detail.chapters.map((chapter) => (
              <Card key={chapter.id} size="small" title={`${chapter.idx}. ${chapter.title}`} className="mt-3"
                extra={
                  <Tag color={chapter.status === 'storyboarded' ? 'success' : chapter.status === 'failed' ? 'error' : 'default'}>
                    {chapter.status === 'storyboarded' ? '已分镜' : chapter.status === 'failed' ? '分镜失败' : '待分镜'}
                  </Tag>
                }
              >
                {chapter.error && (
                  <Typography.Paragraph type="danger" className="text-xs !mb-2">
                    {chapter.error}
                  </Typography.Paragraph>
                )}
                {(shotsByChapter.get(chapter.id) ?? []).map((shot) => {
                  const shotMeta = SHOT_STATUS_META[shot.status] ?? { label: shot.status, color: 'default' };
                  return (
                    <div
                      key={shot.id}
                      className="flex gap-3 py-2 border-t border-[var(--panel-border)] items-start"
                    >
                      <div className="w-24 h-16 shrink-0 rounded-lg overflow-hidden bg-[var(--app-bg)]">
                        {shot.imageUrl ? (
                          <Image src={shot.imageUrl} width={96} height={64} style={{ objectFit: 'cover' }} />
                        ) : (
                          <div className="flex items-center justify-center h-full text-[#bbb] text-xs">
                            无图
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Space size={6} wrap>
                          {/* 状态 Tag 带 #idx 前缀，StatusTag 仅渲染 meta.label，保留原生写法 */}
                          <Tag color={shotMeta.color} className="!mr-0">
                            #{shot.idx} {shotMeta.label}
                          </Tag>
                          {shot.firstFrameLocked && (
                            <Tag className="!mr-0 !text-[11px]" color="volcano">
                              首帧锁定
                            </Tag>
                          )}
                          {shot.shotMode === 't2v' && (
                            <Tag className="!mr-0 !text-[11px]">文生视频</Tag>
                          )}
                          {shot.durationMs ? (
                            <Typography.Text type="secondary" className="text-[11px]">
                              {formatDuration(shot.durationMs)}
                            </Typography.Text>
                          ) : null}
                          {shot.audioDurationMs ? (
                            <Typography.Text type="secondary" className="text-[11px]">
                              配音 {(shot.audioDurationMs / 1000).toFixed(1)}s
                            </Typography.Text>
                          ) : null}
                        </Space>
                        <Typography.Paragraph className="mt-1 !mb-1 text-xs" ellipsis={{ rows: 2 }}>
                          {shot.narration || shot.motionPrompt}
                        </Typography.Paragraph>
                        {shot.error && (
                          <Typography.Text type="danger" className="text-[11px]">
                            {shot.error}
                          </Typography.Text>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <Space size={4}>
                          <Permission code="flow:define:manage">
                            <Button
                              size="small"
                              type="text"
                              icon={<EditOutlined />}
                              onClick={() => setEditingShot(shot)}
                            >
                              编辑
                            </Button>
                          </Permission>
                          <Permission code="flow:run:execute">
                            <Button
                              size="small"
                              type="text"
                              icon={<ThunderboltOutlined />}
                              onClick={() => replan(detail.project.id, shot)}
                            >
                              AI 重新规划
                            </Button>
                          </Permission>
                          <Permission code="flow:run:execute">
                            <Dropdown menu={regenerateMenu(detail.project.id, shot)} trigger={['click']}>
                              <Button size="small">重新生成</Button>
                            </Dropdown>
                          </Permission>
                        </Space>
                        <Space size={8} className="text-[11px]">
                          {shot.audioUrl && (
                            <a href={shot.audioUrl} target="_blank" rel="noreferrer">
                              听配音
                            </a>
                          )}
                          {shot.videoUrl && (
                            <a href={shot.videoUrl} target="_blank" rel="noreferrer">
                              看片段
                            </a>
                          )}
                        </Space>
                      </div>
                    </div>
                  );
                })}
              </Card>
            ))}
          </>
        )}
      </SelfDrawer>

      <NovelShotEditModal
        open={Boolean(editingShot)}
        projectId={detail?.project.id ?? 0}
        shot={editingShot}
        onCancel={() => setEditingShot(null)}
        onSaved={shotSaved}
        onError={(error) => antMessage.error(error instanceof Error ? error.message : '保存失败')}
      />

      {/* 封面合成：底图三选（分镜首帧/重出首帧/上传）+ 标题文字 canvas 合成 */}
      <CoverComposerModal
        open={Boolean(coverProject)}
        projectId={coverProject?.id ?? 0}
        projectName={coverProject?.name ?? ''}
        shots={coverShots}
        onCancel={() => setCoverProject(null)}
        onSaved={coverSaved}
        onError={coverOnError}
      />

      {/* 角色卡：新建/编辑双模式 */}
      <CharacterCardModal
        open={characterModalOpen}
        projectId={detailIdRef.current ?? detail?.project.id ?? 0}
        card={editingCharacter}
        onCancel={() => setCharacterModalOpen(false)}
        onSaved={characterSaved}
        onError={(error) => antMessage.error(error instanceof Error ? error.message : '保存失败')}
      />
    </div>
  );
};
