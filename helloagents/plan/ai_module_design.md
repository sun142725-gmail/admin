# AI 管理模块 · 技术设计文档

- 状态：待评审
- 关联：`ai_module_prd.md`（产品需求）、`divination_redesign.md`（SSE 先例）
- 原则：**适配器模式吃掉模型多样性**——新增厂商=新增一个 Adapter（或零代码复用 openai-compatible），上层（模型路由/智能体/对话）全部协议无关。

## 1. 架构总览

```
前端(React/antd)                     后端(NestJS)
┌─────────────┐   REST/SSE   ┌──────────────────────────────┐
│ AI管理菜单   │ ──────────→  │ AiAdminModule  渠道/模型/智能体 │
│ 5 个页面     │              │ AiChatModule   会话/消息/SSE   │
│ 复用 sse.ts  │ ←──────────  │ AiImageModule  生图            │
└─────────────┘              └──────────┬───────────────────┘
                                        │
                          ┌─────────────▼─────────────┐
                          │  ModelRouter 模型路由       │  model_key → 渠道映射
                          │  (优先级→权重随机→故障转移)  │
                          └─────────────┬─────────────┘
                                        │
              ┌─────────────────────────▼──────────────────────┐
              │ LlmAdapter 统一接口: chatStream/chat/images      │
              ├────────────────────┬───────────────┬───────────┤
              │ OpenAICompatible   │ DifyAdapter   │ (扩展位)   │
              │ (DeepSeek/通义/Kimi │ /chat-messages │ Ollama…  │
              │  /OpenAI/网关…)    │               │           │
              └────────────────────┴───────────────┴───────────┘
```

模块归属：现有 `modules/ai` 升级为目录内的三个子模块（保持独立、低耦合），占卜模块改为通过 `AiChatService` 的统一入口取流（其 prompt 作为一条内置智能体迁移，见 §8 兼容）。

## 2. 数据模型（DB_SYNC 自动建表）

### 2.1 ai_providers 渠道
| 字段 | 类型 | 说明 |
|---|---|---|
| name | varchar(64) | 渠道名，如"DeepSeek 官方" |
| type | varchar(32) | openai-compatible / dify / ollama |
| base_url | varchar(255) | 如 https://api.deepseek.com/v1 |
| api_key_cipher | varchar(512) | AES 加密后的密钥 |
| priority / weight | int | 路由排序（渠道级默认值） |
| status | tinyint | 1 启用 0 停用 |
| remark | varchar(255) | |

### 2.2 ai_models 模型（唯一键去重的锚点）
| 字段 | 类型 | 说明 |
|---|---|---|
| model_key | varchar(64) **unique** | 全局唯一，如 `deepseek-chat`；创建时查重 |
| display_name | varchar(64) | 界面显示名 |
| capabilities | varchar(128) | 逗号分隔：chat,image,vision,embedding |
| context_length / max_output | int | 元数据，前端提示与截断用 |
| default_params | json | 默认采样参数 |
| status | tinyint | |

### 2.3 ai_model_channels 模型-渠道映射
| 字段 | 类型 | 说明 |
|---|---|---|
| model_id | int | → ai_models |
| provider_id | int | → ai_providers |
| upstream_model | varchar(64) | 渠道侧真实模型名（可覆盖 model_key） |
| priority / weight | int | 映射级路由参数 |
| status | tinyint | |
| **unique(model_id, provider_id, upstream_model)** | | 防重复挂载 |

### 2.4 ai_agents 智能体
| 字段 | 类型 | 说明 |
|---|---|---|
| name / description | varchar | |
| kind | varchar(16) | native（内置编排）/ dify（远程应用） |
| model_id | int nullable | native 必填；dify 为空 |
| provider_id | int nullable | dify 类型的目标渠道 |
| system_prompt | text | 系统提示词（知识承载） |
| temperature / top_p / max_tokens | decimal/int | 采样参数 |
| opening_line | varchar(255) | 开场白 |
| allow_image | tinyint | 是否可触发本次生图 |
| sort / status | int/tinyint | |

### 2.5 ai_conversations 会话
user_id、agent_id（nullable=裸模型对话）、model_id、title、status、created_at/updated_at。

### 2.6 ai_messages 消息
conversation_id、role（user/assistant/system）、content（text，长文本）、content_type（text/image）、model_id、channel_id（实际使用渠道，排障用）、prompt_tokens/completion_tokens、latency_ms、status（ok/failed/stopped）、error_message。

### 2.7 ai_usage_logs 用量日志（P1 展示，P0 先落库）
user_id、model_id、channel_id、kind（chat/image）、tokens 三项、latency_ms、status、error_message、created_at。

## 3. 后端设计

### 3.1 目录结构

```
modules/ai/
├── ai.module.ts                 # 聚合子模块 + 导出 AiChatService（占卜复用）
├── admin/
│   ├── providers.{controller,service}.ts
│   ├── models.{controller,service}.ts      # 含渠道映射管理
│   ├── agents.{controller,service}.ts
│   └── dto/
├── chat/
│   ├── conversations.controller.ts         # 会话 CRUD
│   ├── chat.controller.ts                  # POST /chat/completions (SSE)
│   ├── chat.service.ts                     # 编排：上下文→路由→适配器→落库
│   └── dto/
├── image/
│   └── image.{controller,service}.ts       # 生图
├── core/
│   ├── llm-adapter.interface.ts            # 统一适配器接口
│   ├── adapters/openai-compatible.adapter.ts
│   ├── adapters/dify.adapter.ts
│   ├── model-router.service.ts             # 路由 + 故障转移
│   ├── crypto.util.ts                      # AES-256-GCM 加解密
│   └── usage-log.service.ts                # 用量落库（异步不阻塞）
└── dto/（既有）
```

### 3.2 适配器接口（关键扩展点）

```ts
export interface ChatStreamChunk { delta: string; }
export interface LlmAdapter {
  readonly type: string; // 'openai-compatible' | 'dify' | ...
  chatStream(req: ChatRequest, channel: ResolvedChannel): AsyncGenerator<ChatStreamChunk>;
  images?(req: ImageRequest, channel: ResolvedChannel): Promise<ImageResult[]>;
  probe(channel: ResolvedChannel): Promise<ProbeResult>;  // 连通性/模型探测
}
```

- `openai-compatible.adapter.ts`：覆盖 DeepSeek/通义/Kimi/OpenAI/各类网关，实现 chat/chatStream/images/probe（probe 走 `GET /models`）
- `dify.adapter.ts`：`POST /chat-messages`（response_mode=stream），把 Dify 事件流翻译成统一 chunk；probe 走应用参数接口；P1 支持 vision 与文件
- 新增厂商优先判断"是否 openai 兼容"——是则零代码，仅加渠道记录
- 适配器注册表：`Map<type, LlmAdapter>`，Module 内 providers 注入

### 3.3 模型路由

`resolve(modelKey)`：查出该 model_key 的启用映射 → 按 `priority DESC, weight` 加权随机取首个 → 调用失败（网络/5xx/超时）标记该次失败并取下一映射，全部失败抛 `ServiceException('模型暂不可用')`。单次请求内最多重试 3 个渠道，结果（成功渠道/失败列表）写入消息与日志。

### 3.4 对话编排（chat.service）

1. 入参校验：`{ conversationId?, agentId?|modelId?, content }`
2. 组装上下文：system（智能体提示词+开场白不进上下文）+ 历史消息（P0 截断：最近 20 条且总长 ≤ 12000 字符；P1 token 计量）
3. 路由模型 → 适配器流式调用 → SSE 下发 `chunk/done/error`
4. 落库：用户消息即时落，助手消息流结束后整体落（含 tokens/延迟/渠道）
5. 首条消息自动生成会话标题（P0 取内容前 20 字，P1 换模型摘要）
6. 复用 `SseHeadersMiddleware`：路由规则追加 `ai/chat/*` 与 `ai/images/*`
7. **停止生成**：前端 abort → 后端 `res.close` 触发 AsyncGenerator return，已产出内容按现有"部分收尾"逻辑落库

### 3.5 安全与加密

- `crypto.util.ts`：AES-256-GCM，key 取环境变量 `AI_ENCRYPTION_KEY`（32 字节，缺失时启动告警并拒绝创建渠道）
- 密钥仅创建时写入；查询接口只回 `maskKey`（`sk-****abcd`）；更新时传空=不修改
- 所有管理接口 `@UseGuards(JwtAuthGuard, PermissionsGuard)` + 权限码；对话/生图仅 JWT
- 日志与错误信息脱敏：不落 base_url 的 query、不落明文 key

### 3.6 API 清单（/api 前缀省略）

| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| CRUD | `/ai/providers` | ai:provider:manage | 渠道管理 |
| POST | `/ai/providers/:id/test` | 同上 | 连通性测试 |
| POST | `/ai/providers/:id/probe-models` | 同上 | 拉取上游模型列表 |
| CRUD | `/ai/models` | ai:model:manage | 模型注册（model_key 去重） |
| CRUD | `/ai/models/:id/channels` | 同上 | 渠道映射增删/排序 |
| CRUD | `/ai/agents` | ai:agent:manage | 智能体管理 |
| GET | `/ai/agents/enabled`、`/ai/models/enabled` | 登录 | 对话页下拉数据 |
| CRUD | `/ai/chat/conversations` | 登录 | 会话管理（本人） |
| POST | `/ai/chat/completions` | 登录 | SSE 对话 |
| POST | `/ai/images/generations` | 登录 | 生图 |
| GET | `/ai/usage/logs` | ai:usage:view | 用量日志（P1） |

### 3.7 权限码与菜单（seed 追加）

`ai:provider:manage` / `ai:model:manage` / `ai:agent:manage` / `ai:usage:view`，默认绑定超管角色；seed 模块增加幂等插入。

## 4. 前端设计

### 4.1 菜单与路由

「AI 管理」分组（icon: RobotOutlined），路由平铺在 MainLayout 内（对话页内部自布局，不需要全屏）：

| 路由 | 页面 | 要点 |
|---|---|---|
| `/ai/providers` | 渠道管理 | 列表+抽屉表单；测试连通/探测模型按钮；key 脱敏 |
| `/ai/models` | 模型管理 | 列表+抽屉；能力标签 Tag；渠道映射子表格（可拖拽排序优先级） |
| `/ai/agents` | 智能体管理 | 列表+抽屉；提示词大输入框（等宽字体）；kind 切换 native/dify 表单项 |
| `/ai/chat` | AI 对话 | 左会话列表右聊天区；SseStream 渲染；停止/重新生成；markdown 渲染（沿用现有依赖，无则纯文本+代码块样式） |
| `/ai/images` | 生图 | 表单+瀑布结果墙+历史（复用文件服务 URL） |

### 4.2 复用与约定

- SSE 客户端直接复用 `api/sse.ts`（fetch + Authorization，零新依赖）
- 页面结构沿用管理台惯例：ProTable 式列表（现有 Table 封装）+ Drawer 表单 + 权限码控制按钮
- 模型选择器、智能体选择器封装为公共组件（C 端 Vue 移植时只换 UI）
- 对话状态用组件内 `useState` + 会话列表入 RTK（`chatSlice`），刷新后可恢复会话列表

## 5. C 端复用预留

- 接口全部 JWT 鉴权、统一响应包装（SSE 除外），Vue 侧按 `types.ts` 同构复制（同占卜做法）
- 对话/生图不限管理端使用，P1 在移动端 has-web 下挂 `/ai-chat` 入口

## 6. 测试要点

- 单测：model_router（优先级/权重/故障转移）、crypto.util（加解密回环）、model_key 去重（重复创建 422）
- e2e：渠道 CRUD + probe（mock 上游）、对话 SSE 全链路（mock adapter）、越权访问他人会话 403、生图落文件表
- 占卜回归：迁移后占卜解卦 e2e 必须全绿

## 7. 实施顺序（对应 P0 里程碑）

1. core：crypto + adapter 接口 + openai-compatible adapter + model_router + usage_log（含单测）
2. admin 三服务与接口 + seed 权限码
3. chat：会话/消息实体 + SSE 编排（复用 sse 中间件）
4. image：生图 + 文件落库
5. 前端：providers → models → agents → chat → images 五页
6. 占卜迁移到统一入口 + 全量回归
7. CHANGELOG / wiki / ADR

## 8. 兼容与迁移（占卜模块）

- `ai.service.ts` 的 DeepSeek 硬编码调用迁移为：seed 一条"DeepSeek 官方"渠道 + `deepseek-chat` 模型 + "六爻解卦师"内置智能体（提示词搬进库）
- 占卜 `divination.service` 改调 `AiChatService.chatStream(agentCode, lines, hexagram)`——保留占卜专用 prompt 结构，走新适配器与路由
- 过渡期保留旧 `AiService` 导出防破坏，回归通过后删除

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 上游 SSE 格式差异（部分网关不标准） | adapter 内解析容错 + probe 预检；日志保留原始片段样本（脱敏） |
| 流式中断导致消息丢失 | 部分内容收尾落库（占卜已验证该模式） |
| model_key 与上游改名漂移 | 映射级 upstream_model 可独立覆盖，无需改模型注册 |
| Dify 应用类型多样 | P1 只接 chat/agent 型，其他类型在渠道探测时提示不支持 |
| 环境缺 AI_ENCRYPTION_KEY | 启动告警 + 渠道创建接口拒绝，避免明文落库 |
