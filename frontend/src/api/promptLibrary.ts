// 提示词库 API：单轨口径——全部能力（browse/stats/sync + CRUD）打 /prompt-library。
// 2026-10 重构：/prompt-templates CRUD 双轨已并入后端统一控制器（backend/src/modules/prompt-library/
// prompt-library.controller.ts），GET /prompt-templates 列表轨与 listPromptTemplates 死代码已裁剪。
import http from './http';

// 分类常量与后端单一来源互指：backend/src/modules/prompt-library/prompt-categories.ts
// （PROMPT_CATEGORIES 5 流水线基础 key + PROMPT_CATEGORY_LABELS 8 key 中文名）。
// 分类校验已放开为自由字符串（后端 Length(1,64)），本表是「常用值 + 中文名」的前端侧；
// 新增常用分类时与后端 prompt-categories.ts 同步各补一行。
export const PROMPT_CATEGORIES = [
  { value: 'illustrated', label: '插画绘本' },
  { value: 'poster', label: '海报设计' },
  { value: 'anime', label: '动漫' },
  { value: 'ui', label: 'UI 界面' },
  { value: 'general', label: '通用' },
  { value: 'fantasy', label: '玄幻' },
  { value: 'starry', label: '星空' },
  { value: 'xianxia', label: '修仙' }
];

// 分类标签色（原 PromptLibraryPage 内联表并入统一导出）。
export const CATEGORY_COLOR: Record<string, string> = {
  illustrated: 'gold',
  poster: 'purple',
  anime: 'geekblue',
  ui: 'cyan',
  general: 'default',
  fantasy: 'volcano',
  starry: 'blue',
  xianxia: 'green'
};

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

// 库条目 VO（单一 VO）：合并原 PromptTemplate/PromptImageVo 两套类型，补 modelId
// （后端实体字段全集，渲染依赖见 PromptLibraryPage 卡片）。
export interface PromptLibraryItem {
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
  modelId: number | null;
  referenceCount: number;
  createdAt?: string;
}

// CRUD 三函数改打统一路由 /prompt-library（创建者取自 JWT，后端注入 createdBy）。
export const createPromptTemplate = (payload: CreatePromptTemplatePayload) =>
  http.post<never, PromptLibraryItem>('/prompt-library', payload);

// PATCH 语义：所有字段可选（与后端 UpdatePromptTemplateDto = PartialType(Create) 对齐）。
export const updatePromptTemplate = (id: number, payload: Partial<CreatePromptTemplatePayload>) =>
  http.patch<never, PromptLibraryItem>(`/prompt-library/${id}`, payload);

// force 二段确认：referenceCount>0 时直删 409，前端弹引用警示后带 force=true 重发。
export const deletePromptTemplate = (id: number, force?: boolean) =>
  http.delete<never, { success: boolean }>(`/prompt-library/${id}`, {
    params: force ? { force: 'true' } : undefined
  });

// ---------- 筛选分页 / 统计 / 批量同步（flow:prompt:* 细粒度权限） ----------

export interface PromptLibrarySearchResult {
  items: PromptLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PromptLibraryStatsVo {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  // 按来源分组计数（空来源不入 facets）：来源筛选下拉的完整选项口径，不随分页漂移。
  bySource: Array<{ source: string; count: number }>;
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

// timeout 300000：后端单次 sync 上限 ArrayMaxSize(200) 条，hash 分块预查重后通常秒级；
// 仅条目带 imageUrl 时逐条 best-effort 下载（15s/条）会拖长——按 200 条慢库写入+网络抖动留 5 分钟预算。
export const syncPromptImages = (items: SyncPromptImageItem[]) =>
  http.post<never, SyncPromptResultVo>('/prompt-library/sync', { items }, { timeout: 300000 });
