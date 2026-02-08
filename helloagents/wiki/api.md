# API 文档

## 概述
所有接口前缀为 `/api`，统一响应结构为 `{ code, message, data, timestamp, traceId }`。

## 认证方式
使用 JWT accessToken + refreshToken，refreshToken 仅用于刷新，不可访问业务接口。

---

## API 列表

### Auth

#### POST /api/auth/login
**说明:** 用户登录，返回 accessToken 与 refreshToken。

#### POST /api/auth/refresh
**说明:** 刷新令牌。

#### POST /api/auth/logout
**说明:** 退出登录（提高 tokenVersion 失效 refreshToken）。

#### GET /api/auth/profile
**说明:** 获取当前用户信息与权限码。

### Users

#### GET /api/users
**说明:** 用户列表。

#### POST /api/users
**说明:** 新增用户。

#### PATCH /api/users/:id
**说明:** 编辑用户。

#### PATCH /api/users/:id/disable
**说明:** 禁用用户。

#### DELETE /api/users/:id
**说明:** 删除用户。

#### POST /api/users/:id/reset-password
**说明:** 重置密码。

#### POST /api/users/:id/roles
**说明:** 分配角色。

### Roles

#### GET /api/roles
**说明:** 角色列表。

#### POST /api/roles
**说明:** 新增角色。

#### PATCH /api/roles/:id
**说明:** 编辑角色。

#### DELETE /api/roles/:id
**说明:** 删除角色。

#### GET /api/roles/:id/users
**说明:** 查看角色绑定用户。

#### POST /api/roles/:id/permissions
**说明:** 分配权限。

### Permissions

#### GET /api/permissions
**说明:** 权限列表。

#### POST /api/permissions
**说明:** 新增权限。

#### PATCH /api/permissions/:id
**说明:** 编辑权限。

#### DELETE /api/permissions/:id
**说明:** 删除权限。

### Resources

#### GET /api/resources/tree
**说明:** 获取菜单资源树（含权限码）。

#### POST /api/resources
**说明:** 新增资源/菜单。

#### PATCH /api/resources/:id
**说明:** 编辑资源/菜单。

#### DELETE /api/resources/:id
**说明:** 删除资源/菜单。

### Audit

#### GET /api/audit-logs
**说明:** 审计日志列表。

### Divinations

#### POST /api/divinations
**说明:** 新建占卜记录并生成六爻与解卦。

#### GET /api/divinations/:id
**说明:** 查询占卜记录。

### AI

#### POST /api/ai/interpret
**说明:** AI 解卦接口。

### Audit Center

#### GET /api/audit-center
**说明:** 日志中心分页查询。

#### GET /api/audit-center/:id
**说明:** 日志详情查询。

### Log Center

#### POST /api/log-center/events
**说明:** 批量上报打点/前端/错误日志事件。

#### GET /api/log-center
**说明:** 日志中心分页查询（打点/前端/错误）。

#### GET /api/log-center/:type/:id
**说明:** 指定类型日志详情查询。

### Profile

#### GET /api/profile
**说明:** 获取个人资料。

#### PATCH /api/profile
**说明:** 更新个人资料。

#### POST /api/profile/password
**说明:** 修改密码。

#### POST /api/profile/avatar
**说明:** 上传头像。

### Dict

#### GET /api/dicts
**说明:** 字典列表查询。

#### GET /api/dicts/batch
**说明:** 批量字典查询（多 code）。

#### GET /api/dicts/:code
**说明:** 字典详情。

#### POST /api/dicts
**说明:** 新增字典。

#### PATCH /api/dicts/:id
**说明:** 更新字典。

#### DELETE /api/dicts/:id
**说明:** 删除字典。

#### POST /api/dicts/:id/items
**说明:** 新增字典项。

#### PATCH /api/dict-items/:id
**说明:** 更新字典项。

#### DELETE /api/dict-items/:id
**说明:** 删除字典项。

### Notification

#### GET /api/notifications/templates
**说明:** 通知模板列表查询。

#### POST /api/notifications/templates
**说明:** 新增通知模板。

#### PATCH /api/notifications/templates/:id
**说明:** 更新通知模板。

#### POST /api/notifications/publish
**说明:** 发布通知。

#### GET /api/notifications/publish
**说明:** 通知发布记录列表。

#### POST /api/notifications/publish/:id/retry
**说明:** 手动重试发布记录。
