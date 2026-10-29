// 提示词库 API：风格模板 CRUD（Node 直连，非网关转发）。
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

export const updatePromptTemplate = (id: number, payload: CreatePromptTemplatePayload) =>
  http.patch<never, PromptTemplate>(`/prompt-templates/${id}`, payload);

export const deletePromptTemplate = (id: number) =>
  http.delete<never, { success: boolean }>(`/prompt-templates/${id}`);
