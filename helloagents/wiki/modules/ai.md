# AI 中心模块

统一管理 AI 模型与智能体，提供对话与生图能力；上层业务（占卜等）通过统一入口调用，不再硬编码模型。

## Overview
- 管理端：模型管理 / 智能体管理（权限码控制）
- 使用端：AI 对话（多会话流式）、AI 生图（登录即可）
- 核心心智：**一行模型 = 一个可调用端点**（协议 + 请求地址 + API Key），同名模型多行即互为备份；Dify 应用作为智能体直接配置端点与密钥

## Key Flows
### 对话（两段式流）
1. `POST /api/ai/chat/completions`：落库用户消息 + 占位助手消息，后台启动生成，返回 `messageId`
2. `GET /api/ai/chat/stream/:messageId`（@Sse）：订阅生成流；生成中共享同一 Subject，已结束重放落库内容
3. 事件：`chunk`（增量文本）/ `done` / `error`；跳过统一响应包装

### 模型路由
`model_key` 相同的启用行组成候选集（优先级 DESC + 同级按权重随机）→ 逐个故障转移（已产出部分内容则按现有内容收尾，不切换）。去重锚点：`unique(model_key, base_url)`——同地址同模型不允许重复，不同上游的同名模型天然合法。

### 业务编码（code）
`ai_agents.code`：业务模块对接锚点（自增 id 不跨模块引用），全局唯一可空。约定：`divination`=六爻解卦。占卜模块解卦时优先取该编码的启用智能体——使用其系统提示词、采样参数与绑定模型（同 key 多行互备），无配置时逐级回落。

### 密钥安全
模型与 Dify 智能体的 API Key 均经 AES-256-GCM 加密落库（`AI_ENCRYPTION_KEY` 环境变量），接口只回 `mask`（sk-****abcd），更新传空不改密钥。

## API Interfaces
### 管理端（需权限码）
| 方法 | 路径 | 权限码 | 说明 |
|---|---|---|---|
| CRUD | `/api/ai/admin/models` | ai:model:manage | 模型（含端点/密钥） |
| POST | `/api/ai/admin/models/:id/test` | ai:model:manage | 连通性测试 |
| POST | `/api/ai/admin/models/:id/probe-models` | ai:model:manage | 拉取上游模型列表 |
| CRUD | `/api/ai/admin/agents` | ai:agent:manage | 智能体（dify 自带端点/密钥） |
| GET | `/api/ai/usage/logs` | ai:usage:view | 用量日志（P1） |

### 使用端（登录即可）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/ai/chat/conversations` | 会话管理（本人） |
| POST | `/api/ai/chat/completions` | 提交对话 |
| GET | `/api/ai/chat/stream/:messageId` | SSE 订阅生成 |
| GET | `/api/ai/agents/enabled` | 启用智能体下拉 |
| POST | `/api/ai/images/generations` | 生图 |
| GET | `/api/ai/images` | 生图历史 |

## Data Models
`ai_models`（model_key + type + base_url + api_key_cipher，unique: model_key+base_url）/ `ai_agents`（native 绑 modelId；dify 自带 base_url + api_key_cipher；code 业务对接编码）/ `ai_conversations` / `ai_messages`（含 model_id/tokens/延迟）/ `ai_usage_logs` / `ai_images`。字段详见 `helloagents/plan/ai_module_design.md` §2（实施时已将渠道并入模型，废弃 ai_providers / ai_model_channels）。

## Dependencies
- files（预留）、auth（JWT + PermissionsGuard）、占卜模块（经 AiService 统一入口调用模型路由）

## Change History
- [2026-09-21 ai_module](../../plan/ai_module_design.md) - P0：适配器/路由/管理端/对话/生图/占卜桥接；渠道管理并入模型管理
