// 图文故事 API：经 Node 网关转发到 Go core 服务（/api/svc/core/*），结构与 novelVideo.ts 同构。
import http from './http';

export interface GraphicStory {
  id: number;
  title: string;
  mode: 'graphic' | 'anime';
  continuity: boolean;
  styleCategory: string;
  promptTemplateId?: number;
  modelId?: number;
  sourceText: string;
  status: 'draft' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  error?: string;
  videoUrl?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  createdAt: string;
}

export interface GraphicScene {
  id: number;
  storyId: number;
  idx: number;
  name: string;
  content: string;
  scenePrompt?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDurationMs?: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
  error?: string;
  durationMs?: number;
}

export interface GraphicStoryDetail {
  story: GraphicStory;
  scenes: GraphicScene[];
}

export interface CreateGraphicStoryPayload {
  title: string;
  styleCategory: string;
  sourceText: string;
  mode?: 'graphic' | 'anime';
  continuity?: boolean;
  promptTemplateId?: number;
  modelId?: number;
  scenes?: { name: string; content: string }[];
}

const BASE = '/svc/core/graphic/stories';

export const listGraphicStories = (params?: { status?: string; take?: number }) =>
  http.get<never, GraphicStory[]>(BASE, { params });

export const getGraphicStory = (id: number) => http.get<never, GraphicStoryDetail>(`${BASE}/${id}`);

export const createGraphicStory = (payload: CreateGraphicStoryPayload) =>
  http.post<never, GraphicStory>(BASE, payload);

export const runGraphicStory = (id: number) =>
  http.post<never, { storyId: number; accepted: boolean }>(`${BASE}/${id}/run`);

export const cancelGraphicStory = (id: number) =>
  http.post<never, { storyId: number; cancelRequested: boolean }>(`${BASE}/${id}/cancel`);
