// 小说转视频 API：项目 CRUD + 一键运行/取消 + 详情进度。
import http from './http';

export interface NovelPipelineConfig {
  shotsPerChapter: number;
  videoSeconds: number;
  imageSize: string;
  videoSize: string;
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
  imageUrl?: string | null;
  videoUrl?: string | null;
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
