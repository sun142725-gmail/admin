// 提示词库示例图生成 CLI（运维工具，不随服务运行；由人工审阅 dry-run 后 --apply 执行）。
//
// 背景：prompt_templates.example_image_url 此前无数据来源（种子只含文字模板，sync 仅在
// 调用方传 imageUrl 时才落图），页面因此全是占位图。本脚本用库里启用的 image 能力模型
// 把每条模板按示例 content 实际渲染成效果图，落盘 uploads/prompt-library/{promptHash}.<ext>
// 并回写 example_image_url——示例图即模板真实出图效果（LUOSHU 同款语义）。
//
// 用法（在 backend 目录下；默认 dry-run 只读，不调任何外部 API）：
//   npm run gen:prompt-examples                # 干跑：列出待生成行与将使用的模型
//   npm run gen:prompt-examples -- --apply     # 生成：逐张调用 /images/generations 并写库
//
// 安全与成本设计：
//   - 真实消耗已配置模型的生图额度（每行 1 张），--apply 前务必核对 dry-run 的行数；
//   - 断点续跑：已有 example_image_url 的行自动跳过，中断后重跑只补缺；
//   - 顺序执行（并发=1），单张超时 180s；尺寸优先 1536x1024，上游不认时回落 1024x1024；
//   - API Key 从 ai_models.api_key_cipher 解密（AI_ENCRYPTION_KEY，与运行时同源），全程不回显；
//   - 绕过 Nest 栈直连模型，不产生 ai_usage_logs 记录（运维行为，见头注释）；
//   - 网络调用不写测试（AGENTS：第三方上游只做薄封装）；文件扩展名按响应 b64 头/content-type 判定。
//
// 凭据：backend/.env 的 DB_* 与 AI_ENCRYPTION_KEY，密码不回显。
import 'dotenv/config';
import { createConnection } from 'mysql2/promise';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { decryptSecret } from '../src/modules/ai/core/crypto.util';

// 行级 hash：优先取库内 prompt_hash；NULL（早期行）时现算 sha256(trim(template)) 并在回写时补列，
// 避免 "null" 文件名与乐观锁永不命中（prompt_hash = NULL 恒假）。
const rowHash = (row: { template: string; prompt_hash: string | null }): string =>
  row.prompt_hash ?? createHash('sha256').update(row.template.trim()).digest('hex');

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

// 各分类的示例渲染内容：让效果图体现模板本意（占位符 {{content}} 的替换值）。
const SAMPLE_CONTENT: Record<string, string> = {
  fantasy: '苍茫大陆之上，少年自废墟中走出，背负古剑，身后宗门山门巍峨，云海翻涌',
  starry: '夏夜草原之上，银河横贯天际，流星划过，帐篷透出暖光',
  xianxia: '白衣修士立于孤峰之巅，云海在脚下翻涌，远处飞瀑入潭',
  anime: '少女站在樱花树下，微风吹起发丝与裙摆，逆光柔和',
  illustrated: '孩子翻开一本泛黄的绘本，房间暖灯柔和，纸页间透出微光',
  poster: '一场科技产品发布会的极简主视觉，大标题居中',
  ui: '一款阅读 App 的深色模式首页界面，圆角卡片与舒适留白',
  general: '主人公在故事关键瞬间的插画'
};

const sampleContentFor = (category: string | null): string =>
  SAMPLE_CONTENT[(category ?? 'general').trim()] ?? SAMPLE_CONTENT.general;

const renderPrompt = (template: string, sample: string): string =>
  /\{\{\s*content\s*\}\}/.test(template) ? template.replace(/\{\{\s*content\s*\}\}/g, sample) : `${template}：${sample}`;

const sniffExt = (base64: string, contentType: string): string => {
  if (base64.startsWith('iVBOR')) return 'png';
  if (base64.startsWith('/9j/')) return 'jpg';
  if (base64.startsWith('UklGR')) return 'webp';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
};

interface ImageModelRow {
  id: number;
  model_key: string;
  display_name: string;
  base_url: string;
  api_key_cipher: string;
}

const loadImageModel = async (
  connection: Awaited<ReturnType<typeof createConnection>>
): Promise<ImageModelRow & { apiKey: string }> => {
  const [rows] = await connection.query(
    "SELECT id, model_key, display_name, base_url, api_key_cipher FROM ai_models WHERE status=1 AND capabilities LIKE '%image%' ORDER BY priority DESC, id LIMIT 1"
  );
  const model = (rows as Array<ImageModelRow>)[0];
  if (!model) {
    console.error('[中止] 未找到启用的 image 能力模型（ai_models.status=1 AND capabilities 含 image）。');
    process.exit(1);
  }
  const encryptionKey = process.env.AI_ENCRYPTION_KEY ?? '';
  if (!encryptionKey) {
    console.error('[中止] 未读到 AI_ENCRYPTION_KEY，无法解密模型密钥。');
    process.exit(1);
  }
  return { ...model, apiKey: decryptSecret(model.api_key_cipher) };
};

interface TemplateRow {
  id: number;
  name: string;
  category: string | null;
  template: string;
  prompt_hash: string;
}

const generateOne = async (
  model: ImageModelRow & { apiKey: string },
  prompt: string,
  size: string
): Promise<{ buffer: Buffer; ext: string }> => {
  const response = await fetch(`${model.base_url.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
    body: JSON.stringify({ model: model.model_key, prompt, size, n: 1 }),
    signal: AbortSignal.timeout(180_000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as { data?: Array<{ url?: string; b64_json?: string }> };
  const item = (data.data ?? [])[0];
  if (item?.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64'), ext: sniffExt(item.b64_json, response.headers.get('content-type') ?? '') };
  }
  if (item?.url && /^https?:\/\//.test(item.url)) {
    const download = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    if (!download.ok) {
      throw new Error(`示例图下载失败 HTTP ${download.status}`);
    }
    const contentType = download.headers.get('content-type') ?? '';
    return { buffer: Buffer.from(await download.arrayBuffer()), ext: sniffExt('', contentType) };
  }
  throw new Error('响应不含 b64_json 或 url');
};

const apply = process.argv.includes('--apply');

const main = async (): Promise<void> => {
  const connection = await createConnection({ ...readDbConfig(), charset: 'utf8mb4' });
  await connection.query('SET NAMES utf8mb4');
  const model = await loadImageModel(connection);
  const [rows] = await connection.query(
    "SELECT id, name, category, template, prompt_hash FROM prompt_templates WHERE example_image_url IS NULL OR example_image_url = '' ORDER BY id"
  );
  const targets = rows as Array<TemplateRow>;
  console.log(`[模型] ${model.display_name}（${model.model_key} @ ${model.base_url}，密钥已解密不回显）`);
  console.log(`[范围] 待生成示例图 ${targets.length} 行${apply ? '，模式=--apply（真实调用生图 API）' : '，模式=dry-run 只读'}\n`);

  let generated = 0;
  let failed = 0;
  for (const row of targets) {
    const prompt = renderPrompt(row.template, sampleContentFor(row.category));
    if (!apply) {
      console.log(`[干跑] #${row.id} ${row.name}（${row.category ?? 'general'}）→ ${prompt.slice(0, 60)}…`);
      continue;
    }
    let size = '1536x1024';
    try {
      let result: { buffer: Buffer; ext: string };
      try {
        result = await generateOne(model, prompt, size);
      } catch (error) {
        // 尺寸不被上游认领时回落方图重试一次。
        if (size !== '1024x1024' && /size|1536/i.test(error instanceof Error ? error.message : '')) {
          size = '1024x1024';
          result = await generateOne(model, prompt, size);
        } else {
          throw error;
        }
      }
      const hash = rowHash(row);
      const relative = `prompt-library/${hash}.${result.ext}`;
      const absolute = join(process.cwd(), 'uploads', relative);
      await mkdir(join(absolute, '..'), { recursive: true });
      await writeFile(absolute, result.buffer);
      const [update] = await connection.execute(
        'UPDATE prompt_templates SET example_image_url = ?, prompt_hash = COALESCE(prompt_hash, ?) WHERE id = ?',
        [`/uploads/${relative}`, hash, row.id]
      );
      const affected = (update as { affectedRows?: number }).affectedRows ?? 0;
      if (affected !== 1) {
        console.log(`[跳过] #${row.id} ${row.name}：乐观锁未命中（行已变化），图片已落盘未回写`);
      } else {
        console.log(`[完成] #${row.id} ${row.name} → /uploads/${relative}（${size}）`);
        generated += 1;
      }
    } catch (error) {
      failed += 1;
      console.log(`[失败] #${row.id} ${row.name}：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (apply) {
    console.log(`\n—— 汇总（apply）—— 成功 ${generated} / 失败 ${failed} / 共 ${targets.length} 张`);
    if (failed > 0) {
      console.log('存在失败行：重跑本命令只补缺（已有图自动跳过）。');
    }
  } else {
    console.log(`\n—— 汇总（dry-run）—— 将生成 ${targets.length} 张，未调用任何 API。核对后追加 --apply 执行（真实消耗生图额度）。`);
  }
  await connection.end();
};

void main();
