"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const typeorm_1 = require("typeorm");
const ai_model_entity_1 = require("./src/common/entities/ai-model.entity");
const crypto_util_1 = require("./src/modules/ai/core/crypto.util");
(async () => {
    const ds = new typeorm_1.DataSource({
        type: 'mysql', host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
        username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
        entities: [ai_model_entity_1.AiModel], synchronize: false
    });
    await ds.initialize();
    const model = await ds.getRepository(ai_model_entity_1.AiModel).findOne({ where: { id: 9 } });
    await ds.destroy();
    const key = (0, crypto_util_1.decryptSecret)(model.apiKeyCipher);
    const base = model.baseUrl.replace(/\/+$/, '');
    const r1 = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: 'gpt-6.1-sol',
            messages: [{ role: 'user', content: '贵州茅台最近的收盘价是多少？如果你需要查询工具请调用。' }],
            tools: [{ type: 'function', function: { name: 'web_search', description: '搜索互联网最新信息', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }],
            max_tokens: 200
        }),
        signal: AbortSignal.timeout(60000)
    });
    const d1 = await r1.json().catch(() => ({}));
    console.log('tools 测试:', r1.status, '| finish:', d1?.choices?.[0]?.finish_reason, '| tool_calls:', JSON.stringify(d1?.choices?.[0]?.message?.tool_calls ?? null)?.slice(0, 120));
    if (d1?.error)
        console.log('error:', JSON.stringify(d1.error).slice(0, 150));
    const r2 = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: 'gpt-6.1-sol',
            messages: [{ role: 'user', content: '请回答两点：1) 你的知识截止到什么时候？2) 你现在能否联网获取贵州茅台今天的股价？如不能，直接说不能。' }],
            max_tokens: 150
        }),
        signal: AbortSignal.timeout(60000)
    });
    const d2 = await r2.json().catch(() => ({}));
    console.log('自知测试:', (d2?.choices?.[0]?.message?.content ?? '').slice(0, 220));
})().catch((e) => console.log('PROBE ERROR:', e.message));
//# sourceMappingURL=probe-tools.tmp.js.map