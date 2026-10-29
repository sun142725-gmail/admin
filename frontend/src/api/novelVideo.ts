// 小说转视频 API：项目 CRUD + 一键运行/取消 + 详情进度。
import http from './http';

export interface NovelPipelineConfig {
  shotsPerChapter: number;
  videoSeconds: number;
  imageSize: string;
  videoSize: string;
  // 分镜/重新规划 LLM 模型行 id（空则按 chat 能力路由）。
  storyboardModelId?: number;
  // 配音音色（OpenAI 兼容 /audio/speech 的 voice 参数）。
  ttsVoice?: string;
  // 配音模型行 id（空则按 tts 能力路由）。
  ttsModelId?: number;
}

export interface NovelProjectVo {
  id: number;
  name: string;
  sourceText: string;
  status: string;
  stage: string;
  stageMessage?: string | null;
  stylePrompt?: string | null;
  config: NovelPipelineConfig;
  finalVideoPath?: string | null;
  // 字幕文件静态访问路径（/uploads/...，SRT 与成片同目录）。
  finalSubtitlePath?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  createdAt?: string;
}

export interface NovelChapterVo {
  id: number;
  idx: number;
  title: string;
  content: string;
  status: string;
  error?: string | null;
}

export interface NovelShotVo {
  id: number;
  chapterId: number;
  idx: number;
  scenePrompt: string;
  motionPrompt: string;
  narration?: string | null;
  // 锁定的原文片段：非空时 AI 重新规划只改画面，旁白不被改写。
  lockedSourceText?: string | null;
  // 视觉任务（该镜画面要传达的关键信息），出图时并入首帧提示词。
  visualTask?: string | null;
  // 推进方式（如「缓慢推进/快速拉远」），出视频时并入运动提示词。
  progression?: string | null;
  // 视频生成模式：i2v 用首帧图生视频 / t2v 纯文生视频。
  shotMode?: string;
  // 首帧锁定：开启后重跑与单镜重生成不再覆盖既有首帧图。
  firstFrameLocked?: boolean;
  imageUrl?: string | null;
  videoUrl?: string | null;
  // 配音音频静态访问路径（/uploads/...）与相对 uploads 的落盘路径。
  audioUrl?: string | null;
  audioFile?: string | null;
  // 配音实测时长毫秒（字幕时间轴依据）。
  audioDurationMs?: number | null;
  status: string;
  error?: string | null;
  durationMs?: number | null;
}

export interface NovelProjectSummary {
  id: number;
  name: string;
  status: string;
  stage: string;
  stageMessage?: string | null;
  finalVideoPath?: string | null;
  error?: string | null;
  totalShots: number;
  doneShots: number;
  durationMs?: number | null;
  createdAt?: string;
}

export interface NovelProjectDetail {
  project: NovelProjectVo;
  chapters: NovelChapterVo[];
  shots: NovelShotVo[];
  progress: { total: number; done: number; failed: number };
}

export const listNovelProjects = () => http.get<never, NovelProjectSummary[]>('/novel-video');
export const getNovelProject = (id: number) => http.get<never, NovelProjectDetail>(`/novel-video/${id}`);
export const createNovelProject = (payload: {
  name: string;
  text: string;
  stylePrompt?: string;
  config?: Partial<NovelPipelineConfig>;
}) => http.post<never, NovelProjectDetail>('/novel-video', payload);
export const updateNovelProject = (id: number, payload: object) =>
  http.put<never, NovelProjectDetail>(`/novel-video/${id}`, payload);
export const reSplitNovelProject = (id: number) =>
  http.post<never, NovelProjectDetail>(`/novel-video/${id}/split`);
export const runNovelProject = (id: number) =>
  http.post<never, { success: boolean }>(`/novel-video/${id}/run`);
export const cancelNovelProject = (id: number) =>
  http.post<never, { success: boolean; status: string }>(`/novel-video/${id}/cancel`);
export const deleteNovelProject = (id: number) =>
  http.delete<never, { success: boolean }>(`/novel-video/${id}`);

// ---------- 单镜创作控制：片段配置 / AI 重新规划 / 单镜重生成 / 字幕 ----------

export interface UpdateNovelShotPayload {
  // 锁定原文：非空时 AI 重新规划只改画面，旁白以原文为准；null 清除锁定。
  lockedSourceText?: string | null;
  visualTask?: string | null;
  progression?: string | null;
  // i2v = 用首帧图生视频；t2v = 纯文生视频。
  shotMode?: string;
  firstFrameLocked?: boolean;
  narration?: string | null;
}

// 单镜重生成步骤：image 首帧 / video 片段 / audio 配音。
export type NovelShotRegenerateStep = 'image' | 'video' | 'audio';

export const updateNovelShot = (projectId: number, shotId: number, payload: UpdateNovelShotPayload) =>
  http.put<never, NovelShotVo>(`/novel-video/${projectId}/shots/${shotId}`, payload);

// 以下三个为同步长任务（LLM 重规划/出图出片配音/ffmpeg 字幕）：关闭 axios 10s 默认超时，
// 否则前端先断而后端继续跑，用户会看到误导性失败（与网关 svc 转发不限时同思路）。
export const replanNovelShot = (projectId: number, shotId: number) =>
  http.post<never, NovelShotVo>(`/novel-video/${projectId}/shots/${shotId}/replan`, undefined, { timeout: 0 });

export const regenerateNovelShot = (projectId: number, shotId: number, step: NovelShotRegenerateStep) =>
  http.post<never, NovelShotVo>(`/novel-video/${projectId}/shots/${shotId}/regenerate`, { step }, { timeout: 0 });

export const generateNovelSubtitle = (projectId: number) =>
  http.post<never, { subtitlePath: string }>(`/novel-video/${projectId}/subtitle`, undefined, { timeout: 0 });
