# Notification

## Purpose
统一管理通知模板、通道发布与状态追踪。

## Module Overview
- **Responsibility:** 管理通知模板、发布记录、通道适配与站内信落库
- **Status:** ✅Active
- **Last Updated:** 2026-02-07

## Specifications

### Requirement: 通知模板管理
**Module:** notification
支持创建、编辑、停用通知模板，模板内容为富文本并支持变量插入与预览。

#### Scenario: 富文本变量插入
编辑模板时可在富文本中插入变量占位符，保存后渲染时按变量规则替换。
- 预置变量：用户昵称、事件信息、系统参数
- 自定义变量：在模板上定义 key 与说明

### Requirement: 通知发送与通道管理
**Module:** notification
支持选择通道发送通知，首期提供站内信与飞书通道。

#### Scenario: 多通道发布
选择模板与通道发布通知，系统生成发布记录并追踪状态。
- 站内信立即入库
- 飞书通过通道适配器发送
- 支持业务模块直接注入 `NotificationTriggerService` 触发发送

### Requirement: 发布记录与状态追踪
**Module:** notification
记录每次发布的状态、失败原因与重试行为。

#### Scenario: 手动重试
当发送失败时，支持在记录中触发手动重试并记录结果。

## API Interfaces
### [GET] /api/notifications/templates
**Description:** 通知模板列表查询
**Input:** { keyword?, status?, page?, pageSize? }
**Output:** { items[], total, page, pageSize }

### [POST] /api/notifications/templates
**Description:** 新增通知模板
**Input:** { name, channelTypes[], content, variables[], status? }
**Output:** { id }

### [PATCH] /api/notifications/templates/:id
**Description:** 更新通知模板
**Input:** { name?, channelTypes?, content?, variables?, status? }
**Output:** { id }

### [DELETE] /api/notifications/templates/:id
**Description:** 删除模板（仅未被发布记录引用时可删除）
**Input:** { id }
**Output:** true

### [POST] /api/notifications/publish
**Description:** 发布通知
**Input:** { templateId, channelType, recipients[], variables?, title?, extra? }
**Output:** { publishId }

### [GET] /api/notifications/publish
**Description:** 发布记录列表
**Input:** { channelType?, status?, templateId?, keyword?, page?, pageSize? }
**Output:** { items[], total, page, pageSize }

### [POST] /api/notifications/publish/:id/retry
**Description:** 手动重试通知发布
**Input:** { reason? }
**Output:** { publishId, status, retryCount }

### [GET] /api/notifications/inbox
**Description:** 当前登录用户站内信列表
**Input:** { status?, keyword?, page?, pageSize? }
**Output:** { items[], unreadCount, total, page, pageSize }

### [PATCH] /api/notifications/inbox/:id/read
**Description:** 标记单条站内信为已读
**Input:** { id }
**Output:** { id, status, readAt }

### [PATCH] /api/notifications/inbox/read-all
**Description:** 当前用户全部标记为已读
**Input:** none
**Output:** true

## Data Models
### notification_templates
| Field | Type | Description |
|------|------|-------------|
| id | bigint | 主键 |
| name | varchar | 模板名称 |
| channel_types | json | 通道类型 |
| content | text | 模板内容 |
| variables | json | 变量定义 |
| status | tinyint | 0=停用,1=启用 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### notification_publishes
| Field | Type | Description |
|------|------|-------------|
| id | bigint | 主键 |
| template_id | bigint | 模板ID |
| channel_type | varchar | 通道类型 |
| payload | json | 发送参数 |
| status | varchar | 发送状态 |
| fail_reason | text | 失败原因 |
| retry_count | int | 重试次数 |
| idempotency_key | varchar | 幂等标识 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### notification_messages
| Field | Type | Description |
|------|------|-------------|
| id | bigint | 主键 |
| publish_id | bigint | 发布记录ID |
| user_id | bigint | 用户ID |
| title | varchar | 通知标题 |
| content | text | 通知内容 |
| status | varchar | 消息状态 |
| read_at | datetime | 阅读时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

## Dependencies
- auth
- permissions
- resources
- users
- FEISHU_BOT_WEBHOOK (env)

## Change History
- [202602072234_notification-module](../../history/2026-02/202602072234_notification-module/) - 通知管理模块
