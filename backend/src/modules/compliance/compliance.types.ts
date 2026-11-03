// 合规检查链类型与固定文案：DTO/service/scan.util 的单一来源（照 publisher.types.ts 先例）。
// 前后端契约（frontend/src/api/compliance.ts 各持一份，语义写死不得单方变更）。

// 三级语义：block 禁用（任一命中→整体 blocked）/ review 待审（无 block 存在 review→review）/
// replace 提示（仅建议替换，不影响整体结论）。
export const COMPLIANCE_LEVELS = ['block', 'review', 'replace'] as const;

export type ComplianceLevel = (typeof COMPLIANCE_LEVELS)[number];

// 整体结论：AIGC 未声明或任一 block 命中→blocked；否则存在 review→review；否则 pass。
export type ComplianceVerdict = 'pass' | 'review' | 'blocked';

// 扫描词库条目（服务层从启用词投影，纯函数只依赖这两个字段）
export interface ScanWord {
  word: string;
  level: ComplianceLevel;
}

// 扫描命中：start/end 为字段原始文本的 UTF-16 码元偏移（含头不含尾）
export interface ScanHit {
  word: string;
  level: ComplianceLevel;
  start: number;
  end: number;
}

// verdict 判定规则说明（报告 verdictRule 字段与本文档同源，改这里两处同步）
export const COMPLIANCE_VERDICT_RULE =
  '任一 block 命中或 AIGC 未声明 → blocked；无 block 且存在 review → review；否则 pass（replace 仅提示不影响结论）';

// AIGC 标识未声明时的固定提示文案（平台强制标识红线）
export const AIGC_UNDECLARED_MESSAGE =
  '未声明AI生成标识：各平台要求强制标识，请勾选声明后再登记发布';

// 检查链扫描的文案字段与固定顺序（checkedFields 输出同序）
export const COMPLIANCE_CHECK_FIELDS = ['title', 'description', 'tags', 'note'] as const;

export type ComplianceCheckField = (typeof COMPLIANCE_CHECK_FIELDS)[number];
