// 合规检查报告展示纯函数（照 pages/flow/characterImages.ts 同目录纯函数先例，组件内不做格式化逻辑）。
// 仅 import type：vitest 单测在 node 环境运行，类型引用在编译期擦除，不拖入 api/http 的 axios/store 依赖。
import type { ComplianceLevel, ComplianceReport, RunComplianceCheckPayload, SensitiveHitVo } from '../../api/compliance';

// 命中字段中文映射（UI 契约 §5：标题/简介/标签/备注）
export const COMPLIANCE_FIELD_LABELS: Record<SensitiveHitVo['field'], string> = {
  title: '标题',
  description: '简介',
  tags: '标签',
  note: '备注'
};

// 未知字段兜底回显原值（后端新增字段而前端未同步映射时不至于显示空白）
export const fieldLabel = (field: string): string =>
  (COMPLIANCE_FIELD_LABELS as Record<string, string>)[field] ?? field;

export interface ComplianceVerdictTagMeta {
  color: 'red' | 'orange' | 'green';
  text: string;
}

// verdict → Tag 展示元数据：blocked 红「阻止发布」/ review 橙「待人工复核」/ pass 绿「通过」（UI 契约 §5 写死）
const VERDICT_TAG_META: Record<ComplianceReport['verdict'], ComplianceVerdictTagMeta> = {
  blocked: { color: 'red', text: '阻止发布' },
  review: { color: 'orange', text: '待人工复核' },
  pass: { color: 'green', text: '通过' }
};

export const verdictTagMeta = (verdict: ComplianceReport['verdict']): ComplianceVerdictTagMeta =>
  VERDICT_TAG_META[verdict];

// 词库/报告共用级别 Tag 配色：block=red / review=orange / replace=blue（UI 契约 §2）
export const COMPLIANCE_LEVEL_TAG_COLORS: Record<ComplianceLevel, 'red' | 'orange' | 'blue'> = {
  block: 'red',
  review: 'orange',
  replace: 'blue'
};

// 命中位置展示「start-end」（含头不含尾的 UTF-16 码元偏移，直接透传后端数值）
export const formatHitPosition = (start: number, end: number): string => `${start}-${end}`;

// 发布表单值 → check 请求体（UI 契约 §4 写死）：title/note 服务端语义按原样 trim（前端 trim 仅 UX），
// aigcDeclared 用 `=== true` 归一为布尔——表单异常态也恒显式传布尔，请求体永不缺省（缺省 422 红线）。
export const buildCheckPayload = (
  title: string | undefined,
  note: string | undefined,
  aigcDeclared: boolean | undefined
): RunComplianceCheckPayload => ({
  title: title?.trim(),
  note: note?.trim(),
  aigcDeclared: aigcDeclared === true
});
