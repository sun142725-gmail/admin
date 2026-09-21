// 上线同步脚本：将「六爻解卦」智能体（业务编码 divination）同步到目标数据库。
// 幂等可重复执行；配合文档 helloagents/wiki/deploy.md 使用。
//
// 行为：
//   1. （可选）按环境变量确保生图/对话模型行存在：SYNC_MODEL_API_KEY 或 DEEPSEEK_API_KEY
//   2. 按 code=divination 查找智能体；找不到时按名称「六爻解卦」收编（补 code）；仍没有则创建
//   3. 同步智能体的提示词/采样参数；若智能体未绑定模型且上一步确保了模型行，则自动绑定
//
// 运行：cd backend && npm run sync:ai
// 依赖环境变量：DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME、AI_ENCRYPTION_KEY（创建模型行时必需）
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { AiAgent } from '../src/common/entities/ai-agent.entity';
import { encryptSecret } from '../src/modules/ai/core/crypto.util';

const AGENT_CODE = 'divination';
const AGENT_NAME = '六爻解卦';

// 六爻解卦系统提示词（与前端智能体管理一致；改动后重新执行本脚本即可同步）。
const DIVINATION_SYSTEM_PROMPT = `#角色：周易经文解卦师
约束：完全依托通行本《周易》原文（卦辞、彖传、大象、小象、爻辞）进行解读，**不使用纳甲、五行、六亲、世应、生克这套后世术数体系**。

##输入结构说明
接下来用户给到的内容：
1.本卦名称，六爻列表，标记每爻：少阳、少阴、老阳○（动阳）、老阴×（动阴）
2.如果有老阳老阴动爻，附带之卦（变卦）；全部为少阳少阴则为【静卦，无之卦】
3.用户的占问事项：用户自己想问的事情

##解卦执行规则
1.【静卦（无任何动爻）】：没有动爻，不取用任何爻辞。解读顺序：卦名释义→卦辞原文→彖传要义→大象传君子之义，再结合用户问题做现实事理引申。
2.【单爻动（仅有一个动爻）】：以**该动爻爻辞作为核心断义**，兼顾本卦整体卦义，简要提及之卦含义。
3.【两爻及以上多动】：优先本卦卦义，兼顾全部动爻爻辞，不要偏执某一爻；简单说明之卦代表事态变化方向。
4.输出格式固定分四块：
①卦象概况：本卦、是否静卦，如有变卦写明之卦名称；列出动爻位置
②周易原文引用：卦辞、彖、大象；有动爻则贴出动爻的爻辞原文
③经文释义：对原文做白话翻译解释，忠于典籍，不要自行脑洞发挥
④占事启示：结合用户具体问题，给出事态启示，只做哲理层面推演，不做绝对吉凶断言。
5.严禁算命口吻，避免"大吉、大凶"这类口语化断语；行文稳重文言白话结合。
6.文末强制输出：
>⚠️提示：以上为《周易》传统文化解读参考，不构成现实生活决策依据。

请等待传入卦象与占问事件。`;

async function ensureModel(ds: DataSource): Promise<AiModel | null> {
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

async function syncAgent(ds: DataSource, model: AiModel | null): Promise<void> {
  const agentRepo = ds.getRepository(AiAgent);

  let agent = await agentRepo.findOne({ where: { code: AGENT_CODE } });
  if (agent) {
    console.log(`[智能体] 已存在（code=${AGENT_CODE}，id=${agent.id}），同步提示词与参数`);
  } else {
    // 兼容迁移：老数据靠名称收编，避免重复创建。
    agent = await agentRepo.findOne({ where: { name: AGENT_NAME } });
    if (agent) {
      console.log(`[智能体] 按名称「${AGENT_NAME}」找到（id=${agent.id}），补上业务编码 ${AGENT_CODE}`);
    } else {
      agent = agentRepo.create({ name: AGENT_NAME, kind: 'native' });
      console.log('[智能体] 不存在，创建新智能体');
    }
  }

  agent.code = AGENT_CODE;
  agent.kind = 'native';
  agent.systemPrompt = DIVINATION_SYSTEM_PROMPT;
  agent.temperature = '0.70';
  agent.status = 1;
  if (!agent.modelId && model) {
    agent.modelId = model.id;
    console.log(`[智能体] 绑定模型 id=${model.id}`);
  }
  const saved = await agentRepo.save(agent);
  console.log(`[智能体] 同步完成：${saved.name}（id=${saved.id}，code=${saved.code}，modelId=${saved.modelId ?? '未绑定'}）`);
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
    await syncAgent(ds, model);
    console.log('\n✅ 同步完成。解卦链路现按 code=divination 智能体执行。');
  } finally {
    await ds.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('同步失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
