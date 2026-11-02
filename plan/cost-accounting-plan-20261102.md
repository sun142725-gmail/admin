# 成本核算 · 实施计划（2026-11-02）

> 范围（用户确认）：单价配置表 + 聚合报表 + 前端报表页（CSV 导出）。
> 不做：计费扣费、余额、支付。单价默认值属生产配置走环境变量（同步两个 example）。

## 数据底座现状（已核实）
- `ai_usage_logs`：userId/modelId/kind(chat|image|video|tts)/promptTokens/completionTokens/totalTokens/latencyMs/status/createdAt；
  **无项目关联列**（制片厂管线记用量不带 projectId）；image/video/tts 的 token 恒 0（计量基准是数量非 token）；
- token 口径：chat 由 chat.service 估算（字符/常数）；image/video/tts 无 token；
- 单价表不存在；模型实体 ai_models 有 display_name/model_key。

## 模块一 · 模型单价配置表（管理端 CRUD）
- 新实体 `AiModelPrice`（ai_model_prices）：
  - model_id int（关联 ai_models，索引）；kind varchar(16)（chat/image/video/tts，索引）；
  - input_price decimal(12,6)（chat：每 1K 输入 token 单价；非 chat 恒 0）；output_price decimal(12,6)（chat：每 1K 输出 token；image/video/tts：每单位数量单价）；
  - unit varchar(16)（计价单位：tokens_1k/image/second/char，由 kind 决定默认值，dto 校验）；currency varchar(8) default 'CNY'；
  - effective_from datetime(6)（生效时间；聚合取「用量时间 ≤ effective_from 的最新一条」）；remark varchar(255)；
- CRUD API：/ai/model-prices（挂 ai 管理既有权限口径，读代码确认 admin 守卫模式）；列表支持 ?modelId=&kind=；
- 默认单价（环境变量，无匹配价格行时兜底）：AI_PRICE_CHAT_INPUT / AI_PRICE_CHAT_OUTPUT / AI_PRICE_IMAGE / AI_PRICE_VIDEO_PER_SEC / AI_PRICE_TTS_PER_CHAR（币种 AI_PRICE_CURRENCY 默认 CNY）——同步 backend/.env.example 与 deploy/env.production.example；
- e2e：CRUD 全链 + 权限口径 + 生效时间选择逻辑（两行不同 effective_from 取旧）。

## 模块二 · 用量记录补项目关联 + 聚合报表 API
- `ai_usage_logs` 加列：project_id int nullable（索引）+ unit_count int default 0（数量基准：image=张、video=秒、tts=字符；chat 恒 0）——nullable/default 双兼容；
- UsageLogPayload 扩展 projectId?/unitCount?；制片厂管线三处调用点（produceImage/produceVideo/TTS）补传 projectId 与 unitCount（张/秒/字符数）——流程引擎 node-handlers 调用点不传（无项目上下文，自然 null）；
- 聚合 API：GET /ai/usage/report?from=&to=&modelId=&projectId=&kind=
  - SQL group by（day/model/project 三维一次查回）+ service 内计价（价格快照 map：按用量时间取生效价，缺行回落环境变量默认，无默认则 cost=null 并在响应标注 uncovered）；
  - 计价纯函数 computeCost(kind, promptTokens, completionTokens, unitCount, price)：chat=token 公式、其余=unitCount×单价——vitest 全分支；
  - 响应：{ summary:{calls,tokens,unitCount,costByCurrency}, byDay[], byModel[], byProject[] }（byProject 仅统计有 projectId 的记录）；
  - 权限：管理口径（与模型管理一致，实现者读代码确认）；
- e2e：report 聚合口径（固定 fixture 数据断言三维分组与金额）、筛选参数、权限。

## 模块三 · 前端报表页 /ai/usage
- 新页 AI 中心 → 「用量报表」（seed 双处插入：codes + pages，/prompts 先例）；
- 筛选：时间范围（今天/7天/30天/自定义 DateRange）、模型 Select、制片厂项目 Select、类型 Select；
- 汇总卡片：总调用 / 总 token / 总数量（张/秒/字）/ 总成本（按币种分行）；
- 明细表：Tab 切换 按天/按模型/按项目（AppTable，金额列按币种）；
- CSV 导出：前端导出当前明细（toCsv 纯函数：逗号/引号/换行转义 + BOM 防 Excel 乱码，vitest 全分支）；
- seed 权限码 ai:usage:view（codes+pages 双处，防「菜单不可见」先例）。

## 测试与验收
- 后端：computeCost/价格生效选择/CSV 转义纯函数单测 + CRUD 与 report e2e（sqlite）；
- 前端：toCsv vitest；
- 门禁：双端 tsc + 全量 jest + vitest + 双构建全绿；
- 提交拆分：feat 单价配置表与默认价兜底 / feat 用量项目关联与聚合报表 API / feat 用量报表页与CSV导出。
