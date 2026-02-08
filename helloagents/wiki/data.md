# 数据模型

## 概述
核心数据包含用户、角色、权限码、资源与审计日志，支持多对多关系与菜单树结构。

---

## 数据表

### users
**说明:** 用户信息与状态

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 用户主键 |
| username | varchar | Unique | 用户名 |
| password_hash | varchar | Not Null | 密码哈希 |
| nickname | varchar |  | 昵称 |
| email | varchar |  | 邮箱 |
| avatar_url | varchar |  | 头像地址 |
| status | tinyint | Not Null | 0=禁用,1=启用 |
| token_version | int | Not Null | 刷新令牌版本号 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### roles
**说明:** 角色

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 角色主键 |
| name | varchar | Unique | 角色名称 |
| code | varchar | Unique | 角色编码 |
| description | varchar |  | 描述 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### permissions
**说明:** 权限码

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 权限主键 |
| name | varchar |  | 权限名称 |
| code | varchar | Unique | 权限码 |
| description | varchar |  | 描述 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### resources
**说明:** 菜单/页面资源

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 资源主键 |
| name | varchar |  | 资源名称 |
| type | varchar |  | menu/page/button |
| path | varchar |  | 路由路径 |
| parent_id | bigint |  | 父级资源 |
| permission_code | varchar |  | 绑定权限码 |
| sort_order | int |  | 排序 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### user_roles
**说明:** 用户与角色关联

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| user_id | bigint | PK | 用户ID |
| role_id | bigint | PK | 角色ID |

### role_permissions
**说明:** 角色与权限关联

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| role_id | bigint | PK | 角色ID |
| permission_id | bigint | PK | 权限ID |

### audit_logs
**说明:** 审计日志

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 日志主键 |
| user_id | bigint |  | 操作用户 |
| action | varchar | Not Null | 动作类型 |
| module | varchar |  | 模块 |
| detail | text |  | 详情 |
| ip | varchar |  | IP |
| created_at | datetime |  | 创建时间 |

### track_logs
**说明:** 打点日志（PV 等）

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 日志主键 |
| user_id | bigint |  | 用户ID |
| trace_id | varchar |  | 链路ID |
| session_id | varchar |  | 会话ID |
| source | varchar |  | 端来源 |
| page_code | varchar | Not Null | 页面码 |
| path | varchar | Not Null | 路径 |
| user_agent | varchar |  | UserAgent |
| referrer | varchar |  | Referrer |
| created_at | datetime |  | 创建时间 |

### frontend_logs
**说明:** 前端日志（含接口调用日志）

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 日志主键 |
| user_id | bigint |  | 用户ID |
| trace_id | varchar |  | 链路ID |
| session_id | varchar |  | 会话ID |
| source | varchar |  | 端来源 |
| level | varchar | Not Null | 日志级别 |
| category | varchar |  | 日志分类 |
| message | varchar | Not Null | 日志内容 |
| stack | text |  | 堆栈 |
| meta | json |  | 元数据 |
| created_at | datetime |  | 创建时间 |

### error_logs
**说明:** 错误日志

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 日志主键 |
| user_id | bigint |  | 用户ID |
| trace_id | varchar |  | 链路ID |
| session_id | varchar |  | 会话ID |
| source | varchar |  | 端来源 |
| message | varchar | Not Null | 错误信息 |
| stack | text |  | 堆栈 |
| meta | json |  | 元数据 |
| created_at | datetime |  | 创建时间 |

### divinations
**说明:** 占卜记录

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 记录主键 |
| topic | varchar | Not Null | 占卜主题 |
| interpretation | text |  | 解卦内容 |
| user_id | bigint |  | 用户ID |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### divination_lines
**说明:** 六爻结果

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 记录主键 |
| divination_id | bigint | Not Null | 占卜记录ID |
| line_index | int | Not Null | 爻序 |
| sign_str | varchar | Not Null | 符号串 |
| sum | int | Not Null | 组合数字 |
| symbol | varchar | Not Null | 符号 |
| name | varchar | Not Null | 老阳/老阴/少阳/少阴 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### dicts
**说明:** 字典定义

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 字典主键 |
| code | varchar | Unique | 字典编码 |
| name | varchar | Not Null | 字典名称 |
| description | varchar |  | 描述 |
| status | tinyint | Not Null | 0=禁用,1=启用 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### dict_items
**说明:** 字典项

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 字典项主键 |
| dict_id | bigint | Not Null | 字典ID |
| value | varchar | Not Null | 枚举值 |
| label | varchar | Not Null | 默认语言标签 |
| label_i18n | json |  | 多语言标签 |
| sort_order | int |  | 排序 |
| status | tinyint | Not Null | 0=禁用,1=启用 |
| extra | json |  | 扩展字段 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### notification_templates
**说明:** 通知模板

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 模板主键 |
| name | varchar | Not Null | 模板名称 |
| channel_types | json | Not Null | 通道类型 |
| content | text | Not Null | 模板内容 |
| variables | json |  | 变量定义 |
| status | tinyint | Not Null | 0=停用,1=启用 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### notification_publishes
**说明:** 通知发布记录

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 发布主键 |
| template_id | bigint | Not Null | 模板ID |
| channel_type | varchar | Not Null | 通道类型 |
| payload | json |  | 发送参数 |
| status | varchar | Not Null | 发送状态 |
| fail_reason | text |  | 失败原因 |
| retry_count | int | Not Null | 重试次数 |
| idempotency_key | varchar |  | 幂等标识 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

### notification_messages
**说明:** 站内信消息

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | bigint | PK | 消息主键 |
| publish_id | bigint | Not Null | 发布记录ID |
| user_id | bigint | Not Null | 用户ID |
| title | varchar | Not Null | 标题 |
| content | text | Not Null | 内容 |
| status | varchar | Not Null | unread/read |
| read_at | datetime |  | 阅读时间 |
| created_at | datetime |  | 创建时间 |
| updated_at | datetime |  | 更新时间 |

---

## 关系
- users ↔ roles: 多对多（user_roles）
- roles ↔ permissions: 多对多（role_permissions）
- resources 可绑定 permission_code 用于菜单与按钮控制
