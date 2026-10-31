// 种子计划纯函数与种子数据自检（离线：不依赖 DB/网络，AGENTS 规则 1/4）。
//
// 数据自检的目的：防种子数据被改坏时 MySQL 严格模式 INSERT 直接失败或静默截断——
// 容量上限对齐 prompt-template.entity.ts：name varchar(128)、category varchar(64)、
// style_tags varchar(255)、source varchar(64)、template/negative_prompt 为 TEXT（约束走 DTO 口径
// 8000/2000，与 CreatePromptTemplateDto / 前端表单 maxLength 对齐）。
import { createHash } from 'crypto';
import { computeTemplateHash, planSeedTemplates } from '../scripts/seed-prompt-library.core';
import { SEED_PROMPT_TEMPLATES, SeedPromptTemplateItem } from '../scripts/seed-prompt-library.data';

// 与后端 hashPrompt / computePromptHash 三方一致的对照实现。
const sha256Trim = (template: string): string =>
  createHash('sha256').update(template.trim()).digest('hex');

describe('computeTemplateHash', () => {
  it('与 crypto sha256(trim(template)) 对照一致', () => {
    const raw = '  风格描述：{{content}}。要点。  ';
    expect(computeTemplateHash(raw)).toBe(sha256Trim(raw));
    expect(computeTemplateHash(raw)).toBe(computeTemplateHash(raw.trim()));
  });

  it('trim 变体同 hash（幂等键按去空白后的正文计算）', () => {
    expect(computeTemplateHash('  ABC  ')).toBe(computeTemplateHash('ABC'));
    expect(computeTemplateHash('ABC\n')).toBe(computeTemplateHash('ABC'));
  });
});

describe('planSeedTemplates（四分支 + trim 变体）', () => {
  const item = (template: string, name = '样本'): SeedPromptTemplateItem => ({
    name,
    category: 'fantasy',
    styleTags: '玄幻',
    template,
    source: '官方示例'
  });

  it('库内全命中 → 全跳过（不产出插入计划）', () => {
    const items = [item('甲：{{content}}'), item('乙：{{content}}')];
    const existing = [computeTemplateHash('甲：{{content}}'), computeTemplateHash('乙：{{content}}')];
    const plan = planSeedTemplates(items, existing);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.every(({ reason }) => reason.includes('已存在'))).toBe(true);
  });

  it('全未命中 → 全插入', () => {
    const items = [item('甲：{{content}}'), item('乙：{{content}}')];
    const plan = planSeedTemplates(items, []);
    expect(plan.inserts.map(({ template }) => template)).toEqual(['甲：{{content}}', '乙：{{content}}']);
    expect(plan.skipped).toHaveLength(0);
  });

  it('混合：库内命中跳过、未命中入列', () => {
    const items = [item('命中：{{content}}'), item('新增：{{content}}')];
    const plan = planSeedTemplates(items, [computeTemplateHash('命中：{{content}}')]);
    expect(plan.inserts.map(({ template }) => template)).toEqual(['新增：{{content}}']);
    expect(plan.skipped.map(({ item: skipped }) => skipped.template)).toEqual(['命中：{{content}}']);
  });

  it('同批重复 prompt：首条入列、余条跳过（批内重复）', () => {
    const items = [item('重复：{{content}}', '首条'), item('重复：{{content}}', '次条'), item('重复：{{content}}', '三条')];
    const plan = planSeedTemplates(items, []);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].name).toBe('首条');
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.every(({ reason }) => reason.includes('批内重复'))).toBe(true);
  });

  it('trim 变体命中：库内既有行与批内首条两条路径均按去空白正文判定', () => {
    // 库内存的是 trim 后正文：种子带首尾空白的变体必须被识别为已存在。
    const planDb = planSeedTemplates([item('  既有：{{content}}  ')], [computeTemplateHash('既有：{{content}}')]);
    expect(planDb.inserts).toHaveLength(0);
    // 批内：'  X  ' 与 'X' 同 hash，首条（含空白原样）入列、变体跳过。
    const planBatch = planSeedTemplates([item('  批内：{{content}}  ', '带空白'), item('批内：{{content}}', '干净')], []);
    expect(planBatch.inserts).toHaveLength(1);
    expect(planBatch.inserts[0].name).toBe('带空白');
    expect(planBatch.skipped.map(({ item: skipped }) => skipped.name)).toEqual(['干净']);
  });
});

describe('SEED_PROMPT_TEMPLATES 种子数据自检（防改坏：MySQL 严格模式失败或静默截断）', () => {
  it('共 9 条：fantasy/starry/xianxia 各 3 条', () => {
    expect(SEED_PROMPT_TEMPLATES).toHaveLength(9);
    const byCategory = SEED_PROMPT_TEMPLATES.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    }, {});
    expect(byCategory).toEqual({ fantasy: 3, starry: 3, xianxia: 3 });
  });

  it.each(SEED_PROMPT_TEMPLATES.map((item) => [item.name, item] as const))('%s：字段容量与约束全部达标', (_name, item) => {
    // name：非空 ≤128（entity varchar(128)）
    expect(item.name.trim().length).toBeGreaterThan(0);
    expect(item.name.length).toBeLessThanOrEqual(128);
    // category：本次种子限定三主题 slug 且 ≤64（entity varchar(64)）
    expect(['fantasy', 'starry', 'xianxia']).toContain(item.category);
    expect(item.category.length).toBeLessThanOrEqual(64);
    // template：含 {{content}} 占位，1..8000（DTO 口径；entity 为 TEXT）
    expect(item.template).toContain('{{content}}');
    expect(item.template.length).toBeGreaterThanOrEqual(1);
    expect(item.template.length).toBeLessThanOrEqual(8000);
    // styleTags：非空 ≤255（entity varchar(255)）
    expect(item.styleTags.trim().length).toBeGreaterThan(0);
    expect(item.styleTags.length).toBeLessThanOrEqual(255);
    // source：官方示例 且 ≤64（entity varchar(64)）
    expect(item.source).toBe('官方示例');
    expect(item.source.length).toBeLessThanOrEqual(64);
    // negativePrompt：可选，若有 ≤2000（DTO/前端表单口径）
    if (item.negativePrompt !== undefined) {
      expect(item.negativePrompt.length).toBeLessThanOrEqual(2000);
    }
  });

  it('negativePrompt 仅配在战斗与洞府两条（curated 口径）', () => {
    const withNegative = SEED_PROMPT_TEMPLATES.filter((item) => item.negativePrompt !== undefined);
    expect(withNegative.map((item) => item.name).sort()).toEqual(['玄幻战斗瞬间', '宗门洞府灵池'].sort());
  });

  it('9 条 hash 无重复（trim 后正文两两不同）', () => {
    const hashes = SEED_PROMPT_TEMPLATES.map((item) => computeTemplateHash(item.template));
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
