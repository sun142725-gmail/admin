// 合规检查链 API 封装（后端 /api/compliance，JWT 权限：词库四路由 compliance:view/manage、检查 publisher:manage）。
// 契约要点：word 唯一性与查重以后端服务层 trim 为准（前端 trim 仅 UX）；keyword 为字面子串匹配
// （后端 ESCAPE '!' 转义，%/_ 按字面命中）；check 只读不落库，aigcDeclared 必填布尔（缺省 422）。
import http from './http';

export type ComplianceLevel = 'block' | 'review' | 'replace';

export const COMPLIANCE_LEVELS: readonly ComplianceLevel[] = ['block', 'review', 'replace'];

export const COMPLIANCE_LEVEL_LABELS: Record<ComplianceLevel, string> = {
  block: '禁用',
  review: '待审',
  replace: '提示'
};

export interface ComplianceWordVo {
  id: number;
  word: string;
  level: ComplianceLevel;
  status: number;
  suggestion: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueryComplianceWordsParams {
  page?: number;
  pageSize?: number;
  level?: ComplianceLevel;
  status?: 0 | 1;
  keyword?: string;
}

export interface ComplianceWordsPage {
  items: ComplianceWordVo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveComplianceWordPayload {
  word: string;
  level: ComplianceLevel;
  status?: 0 | 1;
  suggestion?: string;
  remark?: string;
}

export interface RunComplianceCheckPayload {
  title?: string;
  description?: string;
  tags?: string;
  note?: string;
  aigcDeclared: boolean;
}

export interface SensitiveHitVo {
  field: 'title' | 'description' | 'tags' | 'note';
  word: string;
  level: ComplianceLevel;
  start: number;
  end: number;
  context: string;
  suggestion: string | null;
}

export interface ComplianceReport {
  verdict: 'pass' | 'review' | 'blocked';
  verdictRule: string;
  checkedFields: string[];
  aigcCheck: { declared: boolean; verdict: 'pass' | 'blocked'; message: string };
  sensitiveHits: SensitiveHitVo[];
  summary: { block: number; review: number; replace: number };
}

export const listComplianceWords = (params: QueryComplianceWordsParams) =>
  http.get<never, ComplianceWordsPage>('/compliance/words', { params });

export const createComplianceWord = (payload: SaveComplianceWordPayload) =>
  http.post<never, ComplianceWordVo>('/compliance/words', payload);

// PATCH 字段均可选（不传不改）：word 仅在改动时携带，避免与自身唯一键无谓判重
export const updateComplianceWord = (id: number, payload: Partial<SaveComplianceWordPayload>) =>
  http.patch<never, ComplianceWordVo>(`/compliance/words/${id}`, payload);

export const deleteComplianceWord = (id: number) => http.delete<never, boolean>(`/compliance/words/${id}`);

export const runComplianceCheck = (payload: RunComplianceCheckPayload) =>
  http.post<never, ComplianceReport>('/compliance/check', payload);
