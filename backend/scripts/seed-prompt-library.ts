// 提示词库示例种子 CLI（只交付工具，不随服务运行；由人工审阅 dry-run 输出后执行）。
//
// 用法（在 backend 目录下；默认 dry-run 只读，绝不写库）：
//   npm run seed:prompt-library                # 干跑：打印 plan 明细（插入/跳过与原因）
//   npm run seed:prompt-library -- --apply     # 写库：逐条参数化 INSERT
//
// 安全设计（与 repair-prompt-mojibake.ts 的差异与取舍）：
//   - 纯 INSERT、零 UPDATE/DELETE：不存在覆盖用户改动的破坏面，故不强制 mysqldump 备份；
//   - 幂等：按 sha256(trim(template)) 与库内 prompt_hash 比对，已存在跳过（保护既有行），
//     同批重复只插首条；--apply 撞 uk_prompt_templates_hash（并发或竞态）catch ER_DUP_ENTRY 计 skipped；
//   - 连接全程显式 utf8mb4（createConnection charset + SET NAMES），杜绝 latin1 双重编码复发
//     （沿用 repair-prompt-mojibake.ts 的连接纪律，2026-10 乱码审计结论）；
//   - created_by=NULL（系统种子非人工）、reference_count=0、未提供的列一律 NULL。
//
// 凭据从 backend/.env 读取（dotenv）：DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME，密码不回显。
import 'dotenv/config';
import { createConnection } from 'mysql2/promise';
import { SEED_PROMPT_TEMPLATES, SeedPromptTemplateItem } from './seed-prompt-library.data';
import { computeTemplateHash, planSeedTemplates } from './seed-prompt-library.core';

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const readDbConfig = (): DbConfig => {
  const password = process.env.DB_PASSWORD ?? '';
  if (!password) {
    console.error('[中止] 未读到 DB_PASSWORD（backend/.env），拒绝连接。密码不回显。');
    process.exit(1);
  }
  return {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? 'rbac',
    password,
    database: process.env.DB_NAME ?? 'rbac'
  };
};

const isDupEntry = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  const errno = (error as { errno?: number })?.errno;
  return code === 'ER_DUP_ENTRY' || errno === 1062;
};

const preview = (text: string, max = 48): string => {
  const flat = text.replace(/\n/g, '\\n');
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
};

/** 逐条参数化 INSERT（事务外单语句：单条失败不影响他条，撞唯一索引计 skipped）。 */
const insertTemplate = async (
  connection: Awaited<ReturnType<typeof createConnection>>,
  item: SeedPromptTemplateItem,
  promptHash: string
): Promise<void> => {
  await connection.execute(
    `INSERT INTO prompt_templates
       (name, category, style_tags, template, negative_prompt, source, prompt_hash,
        reference_count, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW(), NOW())`,
    [
      item.name,
      item.category,
      item.styleTags,
      item.template,
      item.negativePrompt ?? null,
      item.source,
      promptHash
    ]
  );
};

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const config = readDbConfig();
  console.log(
    `[连接] ${config.user}@${config.host}:${config.port}/${config.database}（显式 utf8mb4，密码不回显；模式=${apply ? 'APPLY 写库' : 'dry-run 只读'}）`
  );
  const connection = await createConnection({ ...config, charset: 'utf8mb4' });
  await connection.query('SET NAMES utf8mb4');

  try {
    // 库内既有 hash 全量读出（prompt_templates 为小表，量级远小于一次全表导出成本）。
    const [rows] = await connection.query('SELECT prompt_hash FROM prompt_templates');
    const existingHashes = (rows as Array<{ prompt_hash: string | null }>)
      .map((row) => row.prompt_hash)
      .filter((hash): hash is string => typeof hash === 'string' && hash.length > 0);

    const plan = planSeedTemplates(SEED_PROMPT_TEMPLATES, existingHashes);

    console.log(`[扫描] 库内既有 hash ${existingHashes.length} 个；种子 ${SEED_PROMPT_TEMPLATES.length} 条：`);
    for (const item of plan.inserts) {
      console.log(`  [插入] ${item.name}（${item.category}）template: ${preview(item.template)}`);
    }
    for (const { item, reason } of plan.skipped) {
      console.log(`  [跳过] ${item.name}（${item.category}）：${reason}`);
    }

    if (!apply) {
      console.log(
        `—— 汇总（dry-run）—— received=${SEED_PROMPT_TEMPLATES.length} inserted=${plan.inserts.length} skipped=${plan.skipped.length}；未写库。核对无误后追加 --apply 执行。`
      );
      return;
    }

    let inserted = 0;
    let skipped = plan.skipped.length;
    for (const item of plan.inserts) {
      const promptHash = computeTemplateHash(item.template);
      try {
        await insertTemplate(connection, item, promptHash);
        inserted += 1;
      } catch (error) {
        // 并发/竞态撞唯一索引：另一连接已写入同 hash，计 skipped（幂等语义）。
        if (isDupEntry(error)) {
          skipped += 1;
          console.log(`  [跳过] ${item.name}：INSERT 撞 uk_prompt_templates_hash（并发已入库），计 skipped`);
          continue;
        }
        throw error;
      }
    }
    console.log(`—— 汇总（apply）—— received=${SEED_PROMPT_TEMPLATES.length} inserted=${inserted} skipped=${skipped}`);
    console.log('验收提示：重跑本脚本应报告 inserted=0（幂等）；已存在行未被 UPDATE，用户改动不受影响。');
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(`[失败] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
