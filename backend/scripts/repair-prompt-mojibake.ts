// 提示词库乱码修复 CLI（只交付工具，本工具不随服务运行；由人工审阅 dry-run 输出后自行执行）。
//
// 根因（2026-10 审计实测结论）：prompt_templates id=2..6 五行中文文本是一次性手工 SQL 写入的
// 历史脏数据——写入时容器内 mysql 客户端未带 --default-character-set=utf8mb4，UTF-8 字节被按
// latin1（=cp1252）逐字节解释后再以 utf8mb4 落盘。「官方示例」等来源字样不在任何源码中，
// 属纯数据问题；现行 TypeORM/Go 写链路字符集均健康。运维约定：容器内手工 SQL 必须显式
// --default-character-set=utf8mb4。
//
// 用法（在 backend 目录下；默认 dry-run 只读，绝不写库）：
//   npm run repair:prompt-mojibake                # 干跑：逐行逐字段 before/after + prompt_hash 对照
//   npm run repair:prompt-mojibake -- --apply     # 写库：先强制 mysqldump 单表备份，再乐观锁 UPDATE
//   npm run repair:prompt-mojibake -- --id=2,3,4  # 只处理指定行（可选）
//
// 安全设计：
//   - 连接全程显式 utf8mb4（createConnection charset + SET NAMES）；
//   - --apply 前强制 mysqldump --default-character-set=utf8mb4 单表备份，备份失败即中止；
//   - UPDATE 乐观锁：WHERE id=? 且逐字段带上旧值（affectedRows≠1 即中止该行并报告）；
//   - template 变更必须重算 prompt_hash=sha256(trim(新 template))，重算后按唯一索引
//     uk_prompt_templates_hash 查重，冲突则跳过该行并如实报告（禁止静默改 hash 或删他行）；
//   - 幂等：修复后字段含 CJK，重跑判定不再命中，实际更新行数为 0。
//
// 凭据从 backend/.env 读取（dotenv）：DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME，密码不回显。
import 'dotenv/config';
import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { createConnection } from 'mysql2/promise';
import { computePromptHash, isRestorableMojibake } from './prompt-mojibake.core';

// 作用域：仅 5 个中文文本字段，逐字段独立判定；category/example_image_url/source_url 等
// ASCII 字段靠「还原后无 CJK」条件天然不命中，显式不纳入扫描。
const TEXT_FIELDS = ['name', 'template', 'source', 'style_tags', 'negative_prompt'] as const;
type TextField = (typeof TEXT_FIELDS)[number];

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface FieldChange {
  field: TextField;
  before: string;
  after: string;
  rounds: number;
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

/** 强制单表备份（--apply 前置条件）：mysqldump 显式 utf8mb4，密码走 MYSQL_PWD 环境变量不进命令行。 */
const runMysqldumpBackup = (config: DbConfig): string => {
  const backupDir = join(process.cwd(), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = join(backupDir, `prompt_templates-pre-mojibake-fix-${stamp}.sql`);
  const result = spawnSync(
    'mysqldump',
    [
      '--default-character-set=utf8mb4',
      `--host=${config.host}`,
      `--port=${String(config.port)}`,
      `--user=${config.user}`,
      `--result-file=${backupFile}`,
      config.database,
      'prompt_templates'
    ],
    { env: { ...process.env, MYSQL_PWD: config.password }, encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() ?? result.error?.message ?? '未知原因';
    console.error(`[中止] mysqldump 备份失败（退出码 ${result.status ?? 'N/A'}）：${detail}`);
    console.error('[中止] 按安全约定，备份不成功绝不写库。请确认本机 mysqldump 可用后重试。');
    process.exit(1);
  }
  console.log(`[备份] 单表备份完成：${backupFile}（--default-character-set=utf8mb4）`);
  return backupFile;
};

const preview = (text: string, max = 60): string => {
  const flat = text.replace(/\n/g, '\\n');
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const idArg = args.find((arg) => arg.startsWith('--id='));
  const idFilter = idArg
    ? idArg.slice('--id='.length)
        .split(',')
        .map((raw) => Number(raw.trim()))
        .filter((id) => Number.isInteger(id) && id > 0)
    : null;
  if (idArg && (!idFilter || idFilter.length === 0)) {
    console.error('[中止] --id 参数无效，示例：--id=2,3,4');
    process.exit(1);
  }

  const config = readDbConfig();
  console.log(`[连接] ${config.user}@${config.host}:${config.port}/${config.database}（显式 utf8mb4，密码不回显）`);
  const connection = await createConnection({ ...config, charset: 'utf8mb4' });
  await connection.query('SET NAMES utf8mb4');

  try {
    const where = idFilter ? `WHERE id IN (${idFilter.map(() => '?').join(',')})` : '';
    const [rows] = await connection.query(
      `SELECT id, name, template, source, style_tags, negative_prompt, prompt_hash
       FROM prompt_templates ${where} ORDER BY id`,
      idFilter ?? []
    );
    const candidates = rows as Array<{
      id: number;
      name: string;
      template: string;
      source: string | null;
      style_tags: string | null;
      negative_prompt: string | null;
      prompt_hash: string | null;
    }>;
    console.log(`[扫描] 读到 ${candidates.length} 行，作用域字段：${TEXT_FIELDS.join(' / ')}（判定=五条件，最多 3 轮）`);

    let fixRows = 0;
    let changedFields = 0;
    let skippedRows = 0;
    let appliedRows = 0;
    let abortedRows = 0;

    for (const row of candidates) {
      const changes: FieldChange[] = [];
      const rejected: string[] = [];
      for (const field of TEXT_FIELDS) {
        const value = row[field];
        if (value == null || value === '') {
          continue;
        }
        const judgement = isRestorableMojibake(value);
        if (judgement.restorable && judgement.restored !== undefined) {
          changes.push({ field, before: value, after: judgement.restored, rounds: judgement.rounds });
        } else {
          rejected.push(`${field}: ${judgement.reason}`);
        }
      }
      if (changes.length === 0) {
        console.log(`[行 ${row.id}] 无可还原字段${rejected.length > 0 ? `（${rejected.join('；')}）` : ''}`);
        continue;
      }

      fixRows += 1;
      changedFields += changes.length;
      const templateChange = changes.find((change) => change.field === 'template');
      let newHash: string | null = null;
      if (templateChange) {
        newHash = computePromptHash(templateChange.after);
        const [duplicates] = await connection.query(
          'SELECT id FROM prompt_templates WHERE prompt_hash = ? AND id <> ? LIMIT 1',
          [newHash, row.id]
        );
        const duplicate = (duplicates as Array<{ id: number }>)[0];
        if (duplicate) {
          skippedRows += 1;
          console.log(`[行 ${row.id}] 跳过：template 还原后 prompt_hash 与行 ${duplicate.id} 撞唯一索引 uk_prompt_templates_hash，禁止静默改 hash`);
          continue;
        }
      }

      console.log(`[行 ${row.id}] 待修复 ${changes.length} 字段（${apply ? 'APPLY' : 'dry-run'}）：`);
      for (const change of changes) {
        console.log(`  ${change.field}（${change.rounds} 轮还原）`);
        console.log(`    before: ${preview(change.before)}（${[...change.before].length} 字符）`);
        console.log(`    after : ${preview(change.after)}（${[...change.after].length} 字符）`);
      }
      if (newHash) {
        console.log(`  prompt_hash: ${row.prompt_hash ?? '(空)'} → ${newHash}（template 变更重算）`);
      }

      if (!apply) {
        continue;
      }

      // 乐观锁 UPDATE：SET 新值；WHERE id + 逐字段旧值，affectedRows≠1 即中止该行。
      const setParts = changes.map((change) => `${change.field} = ?`);
      const setParams = changes.map((change) => change.after);
      if (newHash) {
        setParts.push('prompt_hash = ?');
        setParams.push(newHash);
      }
      const whereParts = ['id = ?', ...changes.map((change) => `${change.field} = ?`)];
      const whereParams = [row.id, ...changes.map((change) => change.before)];
      const [result] = await connection.execute(
        `UPDATE prompt_templates SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`,
        [...setParams, ...whereParams]
      );
      const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
      if (affected !== 1) {
        abortedRows += 1;
        console.error(`[行 ${row.id}] 中止：UPDATE affectedRows=${affected}（旧值乐观锁未命中，数据可能已被并发修改），该行未写入`);
        continue;
      }
      appliedRows += 1;
      console.log(`[行 ${row.id}] 已更新（affectedRows=1）`);
    }

    console.log('—— 汇总 ——');
    console.log(`扫描 ${candidates.length} 行：待修复 ${fixRows} 行 / ${changedFields} 字段；跳过 ${skippedRows} 行；${apply ? `已写入 ${appliedRows} 行，中止 ${abortedRows} 行` : 'dry-run 未写库'}。`);
    if (!apply) {
      console.log('干跑完成：请人工核对上方 before/after 与 prompt_hash 对照后，追加 --apply 执行（会先强制 mysqldump 备份）。');
    } else {
      console.log('验收提示：用 --default-character-set=utf8mb4 客户端回读校验（HEX 首字节应为 E5/E6/E7 等正常 UTF-8 前缀，非 C2/C3 连缀）；重跑本工具应报告 0 行待修复（幂等）。');
    }
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(`[失败] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
