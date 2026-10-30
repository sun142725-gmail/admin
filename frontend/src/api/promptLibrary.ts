// 提示词库 API：单轨口径——/prompt-library（查看/统计/同步，flow:prompt:* 细粒度权限）与
// /prompt-templates（CRUD，同一套 flow:prompt:view/manage 权限码，后端已收敛 PermissionsGuard）。
import http from './http';

export interface PromptTemplate {
  id: number;
  name: string;
  category: string;
  styleTags: string | null;
  template: string;
  negativePrompt: string | null;
  exampleImageUrl: string | null;
  source: string | null;
  modelId: number | null;
  referenceCount: number;
  createdAt: string;
}

export interface CreatePromptTemplatePayload {
  name: string;
  category: string;
  styleTags?: string;
  template: string;
  negativePrompt?: string;
  exampleImageUrl?: string;
  source?: string;
  modelId?: number;
}

export const PROMPT_CATEGORIES = [
  { value: 'illustrated', label: '插画绘本' },
  { value: 'poster', label: '海报设计' },
  { value: 'anime', label: '动漫' },
  { value: 'ui', label: 'UI 界面' },
  { value: 'general', label: '通用' }
];

export const listPromptTemplates = (params?: { category?: string; keyword?: string; take?: number }) =>
  http.get<never, PromptTemplate[]>('/prompt-templates', { params });

export const createPromptTemplate = (payload: CreatePromptTemplatePayload) =>
  http.post<never, PromptTemplate>('/prompt-templates', payload);

// PATCH 语义：所有字段可选（与后端 UpdatePromptTemplateDto = PartialType(Create) 对齐）。
export const updatePromptTemplate = (id: number, payload: Partial<CreatePromptTemplatePayload>) =>
  http.patch<never, PromptTemplate>(`/prompt-templates/${id}`, payload);

export const deletePromptTemplate = (id: number) =>
  http.delete<never, { success: boolean }>(`/prompt-templates/${id}`);

// ---------- 提示词库开放端点（/prompt-library，细粒度权限 flow:prompt:*） ----------

// 库条目：在 CRUD 实体上多出采集三件套（来源模型/来源链接/promptHash 幂等键）。
export interface PromptImageVo {
  id: number;
  name: string;
  category: string;
  styleTags: string | null;
  template: string;
  negativePrompt: string | null;
  exampleImageUrl: string | null;
  source: string | null;
  sourceModel: string | null;
  sourceUrl: string | null;
  promptHash: string | null;
  referenceCount: number;
  createdAt?: string;
}

export interface PromptLibrarySearchResult {
  items: PromptImageVo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PromptLibraryStatsVo {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
}

export interface PromptLibrarySearchParams {
  category?: string;
  sourceTool?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// 批量同步条目：prompt 为幂等键（sha256(trim(prompt))），重复提交计 skipped。
export interface SyncPromptImageItem {
  prompt: string;
  category?: string;
  title?: string;
  sourceTool?: string;
  sourceModel?: string;
  imageUrl?: string;
  sourceUrl?: string;
}

export interface SyncPromptResultVo {
  received: number;
  inserted: number;
  skipped: number;
}

export const listPromptImages = (params?: PromptLibrarySearchParams) =>
  http.get<never, PromptLibrarySearchResult>('/prompt-library', { params });

export const promptLibraryStats = () => http.get<never, PromptLibraryStatsVo>('/prompt-library/stats');

// timeout 300000：后端单次 sync 上限 ArrayMaxSize(200) 条，逐条查重+插入通常秒级；
// 仅条目带 imageUrl 时逐条 best-effort 下载（15s/条）会拖长——前端同步表单不传 imageUrl，
// 按 200 条慢库写入+网络抖动留 5 分钟预算。此前 timeout:0（不限时）在弱网下请求会永久 pending。
export const syncPromptImages = (items: SyncPromptImageItem[]) =>
  http.post<never, SyncPromptResultVo>('/prompt-library/sync', { items }, { timeout: 300000 });
