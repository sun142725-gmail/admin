# 设计方案

## 总体方案

采用“单用户主表 + 账号标识表 + 验证码表 + 上传资源表”的结构：

- `users`：统一承载用户主档
- `user_identifiers`：承载手机号、邮箱等登录标识
- `verification_codes`：承载短信/邮件验证码与校验状态
- `file_assets`：承载公共上传文件元数据
- 继续沿用 `roles / permissions / user_roles` 做端能力区分

## 核心表设计

### 1. users

保留现有主表，建议补充：

- `user_type`：`admin / c_end / both`
- `register_channel`：注册来源
- `last_login_at`：最近登录时间
- `default_avatar_url`：可选默认头像
- `status`、`token_version` 继续沿用

说明：
- C 端和管理端共用用户主档
- 是否能进入管理端，由角色和权限控制
- `user_type` 仅做业务侧标记，不替代权限控制

### 2. user_identifiers

用途：一个用户可绑定多个登录标识，支持手机号、邮箱、未来扩展第三方账号。

建议字段：
- `id`
- `user_id`
- `identifier_type`：`phone / email`
- `identifier_value`
- `is_primary`
- `verified_at`
- `status`
- `created_at / updated_at`

约束建议：
- `identifier_type + identifier_value` 唯一
- 同一用户可有多个标识，但每种类型最多一个主标识

### 3. verification_codes

用途：短信/邮件验证码统一管理，不直接写入业务表。

建议字段：
- `id`
- `scene`：`login / register / reset_password / bind`
- `channel`：`sms / email`
- `target`
- `code_hash`
- `expire_at`
- `consumed_at`
- `request_ip`
- `send_status`
- `fail_reason`
- `created_at`

说明：
- 验证码只保存 hash，不明文保存
- 用于限制频率、追踪发送结果、审计

### 4. file_assets

用途：统一管理头像和未来其它文件上传。

建议字段：
- `id`
- `biz_type`：`avatar / profile / common / ...`
- `storage_provider`
- `storage_path`
- `file_name`
- `mime_type`
- `file_size`
- `file_hash`
- `uploaded_by`
- `created_at`

说明：
- 公共上传接口统一落库
- 业务层按 `biz_type` 或路径前缀区分目录

## 登录注册流程

### 手机号验证码登录

1. 校验手机号 + 验证码
2. 若手机号未绑定用户，则自动注册新用户
3. 创建或绑定手机号标识
4. 颁发 token

### 邮箱验证码注册/登录

1. 校验邮箱 + 验证码
2. 若邮箱未绑定用户，则自动注册
3. 创建或绑定邮箱标识
4. 颁发 token

### 重置密码

1. 通过验证码校验目标手机号/邮箱
2. 找到对应用户
3. 更新 `password_hash`
4. `token_version + 1` 使旧 token 失效

## 管理端个人信息模块

建议保留现有 `profile` 模块，补强为：

- `GET /api/profile`：查询个人资料
- `PATCH /api/profile`：修改昵称、邮箱、头像等
- `POST /api/profile/password`：旧密码改密
- `POST /api/profile/avatar`：头像上传

头像上传建议两层：

1. `POST /api/files/upload` 公共上传接口
2. `PATCH /api/profile` 或 `POST /api/profile/avatar` 写入头像引用

## 风险与处理

- 验证码频控：需要按手机号、邮箱、IP 做限流
- 多标识冲突：手机号、邮箱唯一性要强约束
- 旧 token 失效：改密和重置密码必须提升 `token_version`
- 文件安全：限制类型、大小、扩展名，上传后做路径隔离

## ADR

结论：推荐采用单用户主表方案，不拆 C 端和管理端账号表，差异通过标识、角色和权限隔离。
