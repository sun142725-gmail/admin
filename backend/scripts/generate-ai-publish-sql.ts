// 生成线上发布 SQL：拉取开发库的全部 AI 模型与智能体，生成可直接在线上库执行的 INSERT 脚本。
// 语义：INSERT IGNORE —— 线上已存在的行（模型 model_key+base_url 冲突 / 智能体 code 冲突）自动跳过，
//       线上自行添加的数据不受影响；智能体绑定的模型通过 model_key+base_url 关联回填（不依赖自增 id）。
//
// 运行：cd backend && npm run sync:ai:gen
// 环境变量：
//   DB_*                       开发库连接（backend/.env 已含）
//   AI_ENCRYPTION_KEY          开发库加密密钥（backend/.env 已含，解密源密文用）
//   TARGET_AI_ENCRYPTION_KEY   线上加密密钥（导出时重加密用；缺省则原样拷贝密文，仅两端密钥一致时可用）
//   AI_PUBLISH_OUT             输出路径（默认 deploy/generated/ai-publish-<时间戳>.sql）
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { AiAgent } from '../src/common/entities/ai-agent.entity';
import { decryptSecret, encryptSecret } from '../src/modules/ai/core/crypto.util';

const DEV_KEY = process.env.SOURCE_AI_ENCRYPTION_KEY ?? '';
const PROD_KEY = process.env.TARGET_AI_ENCRYPTION_KEY ?? process.env.AI_ENCRYPTION_KEY ?? '';
let warnings = 0;

/** 源库密文 → 线上密文（两端密钥不同则重加密；解密失败原样拷贝并告警）。 */
function reencrypt(cipher: string): string {
  let plain: string;
  try {
    process.env.AI_ENCRYPTION_KEY = DEV_KEY;
    plain = decryptSecret(cipher);
  } catch {
    warnings += 1;
    console.warn('  ⚠ 开发库密钥解密失败，该密文原样输出（仅当两端 AI_ENCRYPTION_KEY 相同时可用）');
    return cipher;
  } finally {
    process.env.AI_ENCRYPTION_KEY = PROD_KEY;
  }
  return encryptSecret(plain);
}

/** SQL 字符串转义：反斜杠/引号/换行，确保每条语句单行（与 mysqldump 行为一致）。 */
function sqlEscapeString(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function sql(v: unknown): string {
  if (v === null || v === undefined) {
    return 'NULL';
  }
  if (typeof v === 'number') {
    return String(v);
  }
  if (typeof v === 'object') {
    return `'${sqlEscapeString(JSON.stringify(v))}'`;
  }
  return `'${sqlEscapeString(String(v))}'`;
}

async function main() {
  // 源库（开发库）必须显式指定，防止 deploy/.env.production 的 DB_*（线上库）被误当数据源。
  const missing = ['SOURCE_DB_HOST', 'SOURCE_DB_USERNAME', 'SOURCE_DB_PASSWORD', 'SOURCE_DB_NAME'].filter(
    (key) => !process.env[key]
  );
  if (missing.length > 0) {
    console.error(`缺少源库（开发库）环境变量：${missing.join('、')}（在 deploy/.env.production 配置 SOURCE_DB_* 与 SOURCE_AI_ENCRYPTION_KEY）`);
    process.exit(1);
  }
  if (!process.env.TARGET_AI_ENCRYPTION_KEY) {
    console.error('缺少 TARGET_AI_ENCRYPTION_KEY（线上加密密钥，导出时用于重加密 API Key）');
    process.exit(1);
  }
  if (PROD_KEY !== DEV_KEY) {
    console.log('已启用密钥重加密：导出的 SQL 内 API Key 使用线上 AI_ENCRYPTION_KEY 加密');
  } else {
    warnings += 1;
    console.warn('⚠ 未配置 TARGET_AI_ENCRYPTION_KEY（线上密钥），密文按开发库原样输出——仅当两端密钥一致时可用');
  }

  const ds = new DataSource({
    type: 'mysql',
    host: process.env.SOURCE_DB_HOST,
    port: Number(process.env.SOURCE_DB_PORT ?? 3306),
    username: process.env.SOURCE_DB_USERNAME,
    password: process.env.SOURCE_DB_PASSWORD,
    database: process.env.SOURCE_DB_NAME,
    entities: [AiModel, AiAgent],
    synchronize: false
  });
  await ds.initialize();
  try {
    const models = await ds.getRepository(AiModel).find({ order: { id: 'ASC' } });
    const agents = await ds.getRepository(AiAgent).find({ order: { id: 'ASC' } });
    const lines: string[] = [];

    lines.push(`-- AI 配置发布 SQL（由 npm run sync:ai:gen 生成于 ${new Date().toISOString()}）`);
    lines.push(`-- 来源：开发库 ${process.env.SOURCE_DB_NAME}@${process.env.SOURCE_DB_HOST}；共 ${models.length} 个模型 / ${agents.length} 个智能体`);
    lines.push('-- 执行：mysql -h <线上主机> -u <用户> -p <数据库名> < 本文件');
    lines.push('-- 语义：INSERT IGNORE —— 线上已存在的行自动跳过（模型按 model_key+base_url、智能体按 code 判重），');
    lines.push('--       线上自行添加的数据不受影响；智能体绑定的模型通过 model_key+base_url 关联回填。');
    if (PROD_KEY !== DEV_KEY) {
      lines.push('-- 密钥：API Key 已用线上 AI_ENCRYPTION_KEY 重加密。');
    }
    lines.push('');
    lines.push('SET NAMES utf8mb4;');
    lines.push('');

    lines.push(`-- ========== 模型（${models.length}）==========`);
    for (const row of models) {
      const values = [
        sql(row.modelKey),
        sql(row.displayName),
        sql(row.type),
        sql(row.baseUrl),
        sql(reencrypt(row.apiKeyCipher)),
        sql(row.apiKeyMask ?? null),
        sql(row.capabilities),
        Number(row.contextLength),
        Number(row.maxOutput),
        Number(row.priority),
        Number(row.weight),
        sql(row.defaultParams ?? null),
        Number(row.status),
        sql(row.remark ?? null)
      ];
      lines.push(
        `INSERT IGNORE INTO ai_models (model_key, display_name, type, base_url, api_key_cipher, api_key_mask, capabilities, context_length, max_output, priority, weight, default_params, status, remark) VALUES (${values.join(', ')});`
      );
    }
    lines.push('');

    lines.push(`-- ========== 智能体（${agents.length}）==========`);
    for (const row of agents) {
      const isDify = row.kind === 'dify';
      const values = [
        sql(row.name),
        sql(row.description ?? null),
        sql(row.kind),
        sql(row.code ?? null),
        isDify && row.apiKeyCipher ? sql(reencrypt(row.apiKeyCipher)) : 'NULL',
        isDify ? sql(row.apiKeyMask ?? null) : 'NULL',
        sql(row.baseUrl ?? null),
        sql(row.systemPrompt ?? null),
        Number(row.temperature),
        row.topP != null ? Number(row.topP) : 'NULL',
        row.maxTokens != null ? Number(row.maxTokens) : 'NULL',
        sql(row.openingLine ?? null),
        Number(row.allowImage),
        Number(row.sort),
        Number(row.status)
      ];
      lines.push(
        `INSERT IGNORE INTO ai_agents (name, description, kind, code, api_key_cipher, api_key_mask, base_url, system_prompt, temperature, topP, max_tokens, opening_line, allow_image, sort, status) VALUES (${values.join(', ')});`
      );
    }
    lines.push('');

    lines.push('-- ========== 智能体模型绑定回填（按 model_key+base_url 关联，不依赖自增 id）==========');
    for (const row of agents) {
      if (!row.modelId) {
        continue;
      }
      const model = models.find((item) => item.id === row.modelId);
      if (!model) {
        warnings += 1;
        console.warn(`  ⚠ 智能体「${row.name}」绑定的模型 id=${row.modelId} 在开发库不存在，跳过回填`);
        continue;
      }
      const agentWhere = row.code ? `a.code = ${sql(row.code)}` : `a.name = ${sql(row.name)} AND a.code IS NULL`;
      lines.push(
        `UPDATE ai_agents a JOIN ai_models m ON m.model_key = ${sql(model.modelKey)} AND m.base_url = ${sql(model.baseUrl)} SET a.model_id = m.id WHERE ${agentWhere};`
      );
    }
    lines.push('');

    const outPath =
      process.env.AI_PUBLISH_OUT ??
      join('..', 'deploy', 'generated', `ai-publish-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.sql`);
    mkdirSync(join(outPath, '..'), { recursive: true });
    writeFileSync(outPath, lines.join('\n'), 'utf8');

    console.log(`\n== 汇总：模型 ${models.length} 行 / 智能体 ${agents.length} 行；警告 ${warnings} ==`);
    console.log(`✅ SQL 已生成：${outPath}`);
    if (warnings > 0) {
      console.warn('⚠ 存在警告，请检查上方日志后再上线执行');
    }
  } finally {
    await ds.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('生成失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
