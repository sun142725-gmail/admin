// 上线同步脚本：将「股市圆桌」六位智能体（五位专家 + 会议主席）同步到目标数据库。
// 幂等可重复执行；智能体提示词与 src/modules/stock/experts.definitions.ts 保持同源。
//
// 行为：
//   1. （可选）按环境变量确保对话模型行存在：SYNC_MODEL_API_KEY 或 DEEPSEEK_API_KEY
//   2. 逐个按 code 查找智能体（stock-trend / stock-momentum / stock-flow / stock-value /
//      stock-risk / stock-moderator），不存在则创建，同步提示词与采样参数
//   3. 智能体未绑定模型且上一步确保了模型行时自动绑定
//
// 运行：cd backend && npm run sync:stock
// 依赖环境变量：DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME、AI_ENCRYPTION_KEY（创建模型行时必需）
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { AiAgent } from '../src/common/entities/ai-agent.entity';
import { encryptSecret } from '../src/modules/ai/core/crypto.util';
import {
  EXPERT_DEFINITIONS,
  MODERATOR_DEFINITION
} from '../src/modules/stock/experts.definitions';

async function ensureModel(ds: DataSource): Promise<AiModel | null> {
  // 直接指定绑定已有模型行：SYNC_STOCK_MODEL_ID=9 npm run sync:stock
  const directId = Number(process.env.SYNC_STOCK_MODEL_ID ?? 0);
  if (directId > 0) {
    const model = await ds.getRepository(AiModel).findOne({ where: { id: directId, status: 1 } });
    if (model) {
      console.log(`[模型] 按 SYNC_STOCK_MODEL_ID 命中：${model.displayName}（id=${model.id}）`);
      return model;
    }
    console.warn(`[模型] SYNC_STOCK_MODEL_ID=${directId} 未找到启用模型，回落环境变量流程`);
  }
  const modelRepo = ds.getRepository(AiModel);
  const modelKey = process.env.SYNC_MODEL_KEY ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const baseUrl = (process.env.SYNC_MODEL_BASE_URL ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1')
    .trim()
    .replace(/\/+$/, '');
  const apiKey = process.env.SYNC_MODEL_API_KEY ?? process.env.DEEPSEEK_API_KEY;

  const existing = await modelRepo.findOne({ where: { modelKey, baseUrl } });
  if (existing) {
    console.log(`[模型] 已存在：${modelKey} @ ${baseUrl}（id=${existing.id}），跳过`);
    return existing;
  }
  if (!apiKey) {
    console.log('[模型] 未配置 SYNC_MODEL_API_KEY/DEEPSEEK_API_KEY，跳过模型创建（智能体将不绑定模型）');
    return null;
  }
  if (!process.env.AI_ENCRYPTION_KEY) {
    console.warn('[模型] 缺少 AI_ENCRYPTION_KEY，无法加密 API Key，跳过模型创建');
    return null;
  }
  const created = await modelRepo.save(
    modelRepo.create({
      modelKey,
      displayName: process.env.SYNC_MODEL_NAME ?? 'DeepSeek Chat',
      type: 'openai-compatible',
      baseUrl,
      apiKeyCipher: encryptSecret(apiKey),
      apiKeyMask: `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}`,
      capabilities: 'chat',
      priority: 0,
      weight: 1,
      status: 1
    })
  );
  console.log(`[模型] 已创建：${modelKey} @ ${baseUrl}（id=${created.id}）`);
  return created;
}

async function syncAgents(ds: DataSource, model: AiModel | null): Promise<void> {
  const agentRepo = ds.getRepository(AiAgent);
  const definitions = [...EXPERT_DEFINITIONS, MODERATOR_DEFINITION];

  for (const def of definitions) {
    const agentName = `股市圆桌·${def.school}${def.name}`;
    let agent = await agentRepo.findOne({ where: { code: def.code } });
    if (agent) {
      console.log(`[智能体] 已存在（code=${def.code}，id=${agent.id}），同步提示词与参数`);
    } else {
      agent = agentRepo.create({ name: agentName, kind: 'native' });
      console.log(`[智能体] 不存在，创建新智能体 ${agentName}`);
    }
    agent.code = def.code;
    agent.name = agentName;
    agent.kind = 'native';
    agent.description = `股市圆桌会议${def.school}专家（业务编码 ${def.code}）`;
    agent.systemPrompt = def.systemPrompt;
    agent.temperature = def.temperature;
    agent.status = 1;
    if (!agent.modelId && model) {
      agent.modelId = model.id;
      console.log(`[智能体] 绑定模型 id=${model.id}`);
    }
    const saved = await agentRepo.save(agent);
    console.log(`[智能体] 同步完成：${saved.name}（id=${saved.id}，modelId=${saved.modelId ?? '未绑定'}）`);
  }
}

async function main() {
  const missing = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`缺少数据库环境变量：${missing.join('、')}（检查 backend/.env 或部署环境）`);
    process.exit(1);
  }
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [AiModel, AiAgent],
    synchronize: false // 表结构由应用启动时同步，脚本只写数据
  });
  await ds.initialize();
  try {
    const model = await ensureModel(ds);
    await syncAgents(ds, model);
    console.log('\n✅ 同步完成。圆桌会议现按 stock-* 智能体执行（未配置智能体时自动回落内置人设）。');
  } finally {
    await ds.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('同步失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
