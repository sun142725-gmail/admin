// 种子计划纯函数（不依赖 DB/网络，jest 可单测，AGENTS 规则 1/4）。
//
// 幂等口径与 prompt-library.service.ts 的 hashPrompt 完全一致：sha256(trim(template))。
// 计划规则（seed CLI 据此执行，绝不 UPDATE/DELETE 已存在行）：
//   - 库内命中（existingHashes 含该 hash）→ skip（已存在，保护用户对既有行的改动）；
//   - 同批重复 hash → 仅首条入列，余条 skip（批内重复）；
//   - 其余 → insert。
import { createHash } from 'crypto';
import { SeedPromptTemplateItem } from './seed-prompt-library.data';

/** 幂等键：sha256(trim(template))。与 prompt-library.service.ts hashPrompt / computePromptHash 口径一致。 */
export const computeTemplateHash = (template: string): string =>
  createHash('sha256').update(template.trim()).digest('hex');

export interface SeedPlanSkip {
  item: SeedPromptTemplateItem;
  reason: string;
}

export interface SeedPlan {
  inserts: SeedPromptTemplateItem[];
  skipped: SeedPlanSkip[];
}

export const planSeedTemplates = (
  items: SeedPromptTemplateItem[],
  existingHashes: Iterable<string>
): SeedPlan => {
  const existing = new Set(existingHashes);
  const inserts: SeedPromptTemplateItem[] = [];
  const skipped: SeedPlanSkip[] = [];
  // 批内去重：hash → 同批首条（含 trim 变体——hash 按 trim 计算，'  X  ' 与 'X' 同 hash）。
  const batchSeen = new Set<string>();
  for (const item of items) {
    const hash = computeTemplateHash(item.template);
    if (existing.has(hash)) {
      skipped.push({ item, reason: '已存在（库内命中，跳过以保护用户改动）' });
      continue;
    }
    if (batchSeen.has(hash)) {
      skipped.push({ item, reason: '批内重复（与同批首条正文一致，仅保留首条）' });
      continue;
    }
    batchSeen.add(hash);
    inserts.push(item);
  }
  return { inserts, skipped };
};
