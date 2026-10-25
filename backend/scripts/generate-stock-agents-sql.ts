// 生成「股市圆桌」智能体的幂等发布 SQL（deploy/scripts/stock-agents.sql）。
// 与 sync-stock-agents.ts 同源（experts.definitions.ts）；提示词更新后重跑本脚本并提交 SQL，
// 线上由 deploy-panel 的「同步圆桌智能体」按钮（docker exec mysql）一键执行。
//
// SQL 语义：INSERT ... ON DUPLICATE KEY UPDATE（按 code 幂等）；
// 模型绑定通过 @stock_model_key 变量按 model_key+base_url 回填，不依赖自增 id。
// 运行：cd backend && npm run sync:stock:gen
import * as fs from 'fs';
import * as path from 'path';
import { EXPERT_DEFINITIONS, MODERATOR_DEFINITION } from '../src/modules/stock/experts.definitions';

const OUT_PATH = path.resolve(__dirname, '../../deploy/scripts/stock-agents.sql');

// 绑定的目标模型（线上可通过修改变量调整，默认 gpt-6.1-sol）。
const STOCK_MODEL_KEY = 'gpt-6.1-sol';
const STOCK_MODEL_BASE_URL = 'https://api-cn.hi-code.cc/v1';

const sql = (value: string | null): string =>
  value == null ? 'NULL' : `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const lines: string[] = [
  '-- 股市圆桌六位智能体（生成物，勿手改；源：backend/src/modules/stock/experts.definitions.ts）',
  '-- 重新生成：cd backend && npm run sync:stock:gen',
  '-- 语义：INSERT ... ON DUPLICATE KEY UPDATE，按 code 幂等，可重复执行。',
  '-- 模型绑定：文末 UPDATE 按 model_key + base_url 匹配 ai_models 回填 model_id；',
  '--          线上模型不同时改文末两个字面量即可（模型行需已存在）。',
  '',
];

for (const def of [...EXPERT_DEFINITIONS, MODERATOR_DEFINITION]) {
  const name = `股市圆桌·${def.school}${def.name}`;
  lines.push(
    `INSERT INTO ai_agents (name, description, kind, code, system_prompt, temperature, status) VALUES (`,
    `  ${sql(name)}, ${sql(`股市圆桌会议${def.school}专家（业务编码 ${def.code}）`)}, 'native', ${sql(def.code)},`,
    `  ${sql(def.systemPrompt)}, ${sql(def.temperature)}, 1`,
    `) ON DUPLICATE KEY UPDATE`,
    `  name = VALUES(name), description = VALUES(description), kind = 'native',`,
    `  system_prompt = VALUES(system_prompt), temperature = VALUES(temperature), status = 1;`,
    ''
  );
}

lines.push(
  '-- 绑定模型：所有 stock-* 智能体指向目标模型行（未匹配到时保持原绑定，不报错）。',
  `-- 当前目标：${STOCK_MODEL_KEY} @ ${STOCK_MODEL_BASE_URL}（线上不同时改下面两个字面量）`,
  'UPDATE ai_agents a',
  `JOIN ai_models m ON m.model_key = ${sql(STOCK_MODEL_KEY)} AND m.base_url = ${sql(STOCK_MODEL_BASE_URL)}`,
  "SET a.model_id = m.id",
  "WHERE a.code LIKE 'stock-%' AND m.status = 1;",
  '',
  '-- 核对：应返回 6 行且 model_id 非空。',
  "SELECT a.code, a.name, a.model_id, m.model_key FROM ai_agents a LEFT JOIN ai_models m ON m.id = a.model_id WHERE a.code LIKE 'stock-%';"
);

fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf-8');
console.log(`✅ SQL 已生成：${OUT_PATH}`);
