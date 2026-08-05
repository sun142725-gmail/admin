# 家庭管理应用 - 后端 API 接口规范

> 版本：v1.0  
> 日期：2026-08-05  
> Base URL：`/api`  
> 认证方式：`Authorization: Bearer <accessToken>`  
> 统一响应格式：`{ code: number, message: string, data: T }`  
> HTTP 状态码：200 成功 / 400 参数错误 / 401 未认证 / 403 无权限 / 404 不存在 / 500 服务错误  

---

## 统一说明

### 响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

| code | 说明 |
|------|------|
| 0 | 成功 |
| 40001 | 参数校验失败 |
| 40101 | 未登录或 token 过期 |
| 40301 | 无权限 |
| 40401 | 资源不存在 |
| 40901 | 冲突（如邀请码已过期、家庭人数已满） |
| 50000 | 服务器错误 |

### 分页参数

- 请求：`?page=1&pageSize=20`
- 响应：

```json
{
  "list": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

---

## 一、认证模块（已有，列出供参考）

### 1.1 密码登录

```
POST /api/auth/login
```

**Request:**
```json
{
  "account": "string",    // 手机号 / 邮箱 / 用户名
  "password": "string"
}
```

**Response:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "profile": {
    "id": "string",
    "username": "string",
    "nickname": "string",
    "avatarUrl": "string",
    "phone": "string",
    "email": "string"
  }
}
```

### 1.2 验证码登录

```
POST /api/auth/code-login
```

**Request:**
```json
{
  "channel": "sms" | "email",
  "target": "string",     // 手机号或邮箱
  "code": "string"        // 验证码
}
```

### 1.3 注册

```
POST /api/auth/register
```

**Request:**
```json
{
  "channel": "sms" | "email",
  "target": "string",
  "code": "string",
  "password": "string"
}
```

### 1.4 发送验证码

```
POST /api/auth/send-code
```

**Request:**
```json
{
  "channel": "sms" | "email",
  "scene": "login" | "register" | "reset",
  "target": "string"
}
```

### 1.5 刷新 Token

```
POST /api/auth/refresh
```

**Request:**
```json
{
  "refreshToken": "string"
}
```

### 1.6 退出登录

```
POST /api/auth/logout
```

### 1.7 获取当前用户信息

```
GET /api/auth/profile
```

**Response:**
```json
{
  "id": "string",
  "username": "string",
  "nickname": "string",
  "avatarUrl": "string",
  "phone": "string",
  "email": "string",
  "currentFamilyId": "string | null"
}
```

---

## 二、家庭模块

### 2.1 创建家庭

```
POST /api/family/create
```

**Request:**
```json
{
  "name": "string",       // 家庭名称，2-20 字符
  "avatar": "string"      // 内置头像标识，如 "avatar_01"
}
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "avatar": "string",
  "ownerId": "string",
  "memberCount": 1,
  "createdAt": "2026-08-05T12:00:00.000Z"
}
```

**说明：** 创建者自动成为房主（owner）。

---

### 2.2 加入家庭

```
POST /api/family/join
```

**Request:**
```json
{
  "code": "string"        // 6 位邀请码
}
```

**Response:**
```json
{
  "familyId": "string",
  "name": "string",
  "joined": true
}
```

**错误码：**
| code | 说明 |
|------|------|
| 40401 | 邀请码不存在 |
| 40901 | 邀请码已过期 |
| 40902 | 已加入该家庭 |
| 40903 | 家庭人数已满（20 人） |

**说明：** 一期简化，不需要审核流程，直接加入。

---

### 2.3 获取用户家庭列表

```
GET /api/family/list
```

**Response:**
```json
{
  "families": [
    {
      "id": "string",
      "name": "string",
      "avatar": "string",
      "ownerId": "string",
      "memberCount": 3,
      "role": "owner" | "member",
      "createdAt": "2026-08-05T12:00:00.000Z"
    }
  ],
  "currentFamilyId": "string | null"
}
```

**说明：** 返回当前用户加入的所有家庭，以及当前活跃家庭 ID。

---

### 2.4 获取家庭详情

```
GET /api/family/:familyId/detail
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "avatar": "string",
  "ownerId": "string",
  "memberCount": 3,
  "createdAt": "2026-08-05T12:00:00.000Z",
  "members": [
    {
      "id": "string",
      "userId": "string",
      "nickname": "string",
      "avatarUrl": "string",
      "role": "owner" | "member",
      "joinedAt": "2026-08-05T12:00:00.000Z"
    }
  ]
}
```

**权限：** 家庭成员可访问。

---

### 2.5 更新家庭信息

```
PUT /api/family/:familyId/update
```

**Request:**
```json
{
  "name": "string",       // 可选，家庭名称
  "avatar": "string"      // 可选，头像标识
}
```

**权限：** 仅房主。

---

### 2.6 解散家庭

```
DELETE /api/family/:familyId
```

**权限：** 仅房主。  
**说明：** 解散后所有成员被移除，数据清空。

---

### 2.7 切换当前活跃家庭

```
POST /api/family/:familyId/switch
```

**Response:**
```json
{
  "currentFamilyId": "string"
}
```

**说明：** 切换用户当前活跃家庭，后续接口默认操作该家庭。

---

### 2.8 生成/刷新邀请码

```
POST /api/family/:familyId/invite-code
```

**Request:**
```json
{
  "expireDays": 7         // 可选，默认 7 天
}
```

**Response:**
```json
{
  "code": "ABC123",       // 6 位邀请码
  "familyId": "string",
  "expiresAt": "2026-08-12T12:00:00.000Z",
  "createdAt": "2026-08-05T12:00:00.000Z"
}
```

**权限：** 仅房主。  
**说明：** 每次调用生成新邀请码，旧邀请码失效。

---

### 2.9 获取当前邀请码

```
GET /api/family/:familyId/invite-code
```

**Response:**
```json
{
  "code": "ABC123",
  "expiresAt": "2026-08-12T12:00:00.000Z",
  "createdAt": "2026-08-05T12:00:00.000Z"
}
```

**权限：** 仅房主。

---

## 三、家庭成员模块

### 3.1 获取成员列表

```
GET /api/family/:familyId/members
```

**Response:**
```json
{
  "list": [
    {
      "id": "string",
      "userId": "string",
      "nickname": "string",
      "avatarUrl": "string",
      "role": "owner" | "member",
      "joinedAt": "2026-08-05T12:00:00.000Z"
    }
  ],
  "total": 3
}
```

**权限：** 家庭成员可访问。

---

### 3.2 修改成员昵称

```
PUT /api/family/:familyId/members/:memberId
```

**Request:**
```json
{
  "nickname": "string"    // 新昵称，1-20 字符
}
```

**权限：** 仅房主。

---

### 3.3 移除成员

```
DELETE /api/family/:familyId/members/:memberId
```

**权限：** 仅房主。  
**说明：** 不能移除自己（房主）。

---

### 3.4 退出家庭

```
POST /api/family/:familyId/leave
```

**权限：** 普通成员。  
**说明：** 房主不能退出，需先转让或解散家庭。

---

### 3.5 获取加入申请列表

```
GET /api/family/:familyId/join-requests
```

**Response:**
```json
{
  "list": [
    {
      "id": "string",
      "userId": "string",
      "nickname": "string",
      "avatarUrl": "string",
      "status": "pending",
      "createdAt": "2026-08-05T12:00:00.000Z"
    }
  ]
}
```

**权限：** 仅房主。  
**说明：** 一期简化，加入不需审核，此接口预留给二期。

---

### 3.6 同意加入申请

```
POST /api/family/:familyId/join-requests/:requestId/approve
```

**权限：** 仅房主。

---

### 3.7 拒绝加入申请

```
POST /api/family/:familyId/join-requests/:requestId/reject
```

**权限：** 仅房主。

---

## 四、家务待办模块

### 4.1 获取待办列表

```
GET /api/family/:familyId/todos?status=pending&page=1&pageSize=20
```

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | `pending` / `completed`，不传返回全部 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 20 |

**Response:**
```json
{
  "list": [
    {
      "id": "string",
      "title": "string",
      "creatorId": "string",
      "creatorName": "string",
      "assigneeId": "string",
      "assigneeName": "string",
      "assigneeAvatar": "string",
      "dueDate": "2026-08-05",
      "status": "pending" | "completed",
      "completedAt": "2026-08-05T12:00:00.000Z" | null,
      "createdAt": "2026-08-05T12:00:00.000Z",
      "updatedAt": "2026-08-05T12:00:00.000Z"
    }
  ],
  "total": 10,
  "page": 1,
  "pageSize": 20
}
```

**权限：** 家庭成员可访问。

---

### 4.2 获取待办详情

```
GET /api/family/:familyId/todos/:todoId
```

**Response:** 同列表项结构。

---

### 4.3 创建待办

```
POST /api/family/:familyId/todos
```

**Request:**
```json
{
  "title": "string",        // 必填，1-50 字符
  "assigneeId": "string",   // 必填，执行人用户 ID
  "dueDate": "2026-08-05"   // 必填，截止日期 YYYY-MM-DD
}
```

**Response:**
```json
{
  "id": "string",
  "title": "string",
  "creatorId": "string",
  "creatorName": "string",
  "assigneeId": "string",
  "assigneeName": "string",
  "assigneeAvatar": "string",
  "dueDate": "2026-08-05",
  "status": "pending",
  "completedAt": null,
  "createdAt": "2026-08-05T12:00:00.000Z",
  "updatedAt": "2026-08-05T12:00:00.000Z"
}
```

**权限：** 家庭成员可创建。

---

### 4.4 更新待办

```
PUT /api/family/:familyId/todos/:todoId
```

**Request:**
```json
{
  "title": "string",        // 可选
  "assigneeId": "string",   // 可选
  "dueDate": "2026-08-05"   // 可选
}
```

**权限：** 创建人或房主。  
**说明：** 已完成的待办不允许修改。

---

### 4.5 标记完成 / 取消完成

```
PATCH /api/family/:familyId/todos/:todoId/complete
```

```
PATCH /api/family/:familyId/todos/:todoId/incomplete
```

**Response:**
```json
{
  "id": "string",
  "status": "completed" | "pending",
  "completedAt": "2026-08-05T12:00:00.000Z" | null
}
```

**权限：** 家庭成员均可操作。

---

### 4.6 删除待办

```
DELETE /api/family/:familyId/todos/:todoId
```

**权限：** 创建人或房主。

---

## 五、家庭公告模块

### 5.1 获取公告列表

```
GET /api/family/:familyId/announcements?page=1&pageSize=20
```

**Response:**
```json
{
  "list": [
    {
      "id": "string",
      "title": "string",
      "content": "string",
      "publisherId": "string",
      "publisherName": "string",
      "publishedAt": "2026-08-05T12:00:00.000Z",
      "createdAt": "2026-08-05T12:00:00.000Z"
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

**权限：** 家庭成员可访问。

---

### 5.2 获取公告详情

```
GET /api/family/:familyId/announcements/:announcementId
```

**Response:** 同列表项结构。

---

### 5.3 发布公告

```
POST /api/family/:familyId/announcements
```

**Request:**
```json
{
  "title": "string",      // 必填，1-30 字符
  "content": "string"     // 必填，1-500 字符
}
```

**Response:**
```json
{
  "id": "string",
  "title": "string",
  "content": "string",
  "publisherId": "string",
  "publisherName": "string",
  "publishedAt": "2026-08-05T12:00:00.000Z",
  "createdAt": "2026-08-05T12:00:00.000Z"
}
```

**权限：** 仅房主。

---

### 5.4 删除公告

```
DELETE /api/family/:familyId/announcements/:announcementId
```

**权限：** 仅房主。

---

## 六、首页概览模块

### 6.1 获取家庭总览数据

```
GET /api/family/:familyId/dashboard
```

**Response:**
```json
{
  "family": {
    "id": "string",
    "name": "string",
    "avatar": "string",
    "memberCount": 3
  },
  "members": [
    {
      "id": "string",
      "userId": "string",
      "nickname": "string",
      "avatarUrl": "string",
      "role": "owner" | "member"
    }
  ],
  "stats": {
    "memberCount": 3,
    "pendingTodoCount": 5,
    "noticeCount": 12
  },
  "latestAnnouncement": {
    "id": "string",
    "title": "string",
    "publishedAt": "2026-08-05T12:00:00.000Z"
  } | null,
  "latestTodos": [
    {
      "id": "string",
      "title": "string",
      "assigneeName": "string",
      "assigneeAvatar": "string",
      "dueDate": "2026-08-05",
      "status": "pending"
    }
  ]
}
```

**权限：** 家庭成员可访问。  
**说明：** 一次请求返回首页所需的全部数据，减少多次请求。

---

## 七、用户模块

### 7.1 更新个人资料

```
PUT /api/user/profile
```

**Request:**
```json
{
  "nickname": "string",    // 可选，昵称
  "avatarUrl": "string"    // 可选，头像 URL（一期内置头像）
}
```

**Response:**
```json
{
  "id": "string",
  "username": "string",
  "nickname": "string",
  "avatarUrl": "string",
  "phone": "string",
  "email": "string"
}
```

---

### 7.2 获取用户设置

```
GET /api/user/settings
```

**Response:**
```json
{
  "notificationEnabled": true
}
```

---

### 7.3 更新用户设置

```
PUT /api/user/settings
```

**Request:**
```json
{
  "notificationEnabled": true
}
```

---

## 八、接口总览表

| 序号 | 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|------|
| | | **认证** | | |
| 1 | POST | `/api/auth/login` | 密码登录 | 公开 |
| 2 | POST | `/api/auth/code-login` | 验证码登录 | 公开 |
| 3 | POST | `/api/auth/register` | 注册 | 公开 |
| 4 | POST | `/api/auth/send-code` | 发送验证码 | 公开 |
| 5 | POST | `/api/auth/refresh` | 刷新 Token | 公开 |
| 6 | POST | `/api/auth/logout` | 退出登录 | 登录 |
| 7 | GET | `/api/auth/profile` | 获取用户信息 | 登录 |
| | | **家庭** | | |
| 8 | POST | `/api/family/create` | 创建家庭 | 登录 |
| 9 | POST | `/api/family/join` | 加入家庭 | 登录 |
| 10 | GET | `/api/family/list` | 家庭列表 | 登录 |
| 11 | GET | `/api/family/:familyId/detail` | 家庭详情 | 成员 |
| 12 | PUT | `/api/family/:familyId/update` | 更新家庭 | 房主 |
| 13 | DELETE | `/api/family/:familyId` | 解散家庭 | 房主 |
| 14 | POST | `/api/family/:familyId/switch` | 切换家庭 | 成员 |
| 15 | POST | `/api/family/:familyId/invite-code` | 生成邀请码 | 房主 |
| 16 | GET | `/api/family/:familyId/invite-code` | 获取邀请码 | 房主 |
| | | **成员** | | |
| 17 | GET | `/api/family/:familyId/members` | 成员列表 | 成员 |
| 18 | PUT | `/api/family/:familyId/members/:memberId` | 修改昵称 | 房主 |
| 19 | DELETE | `/api/family/:familyId/members/:memberId` | 移除成员 | 房主 |
| 20 | POST | `/api/family/:familyId/leave` | 退出家庭 | 成员 |
| 21 | GET | `/api/family/:familyId/join-requests` | 申请列表 | 房主 |
| 22 | POST | `/api/family/:familyId/join-requests/:requestId/approve` | 同意申请 | 房主 |
| 23 | POST | `/api/family/:familyId/join-requests/:requestId/reject` | 拒绝申请 | 房主 |
| | | **待办** | | |
| 24 | GET | `/api/family/:familyId/todos` | 待办列表 | 成员 |
| 25 | GET | `/api/family/:familyId/todos/:todoId` | 待办详情 | 成员 |
| 26 | POST | `/api/family/:familyId/todos` | 创建待办 | 成员 |
| 27 | PUT | `/api/family/:familyId/todos/:todoId` | 更新待办 | 创建人/房主 |
| 28 | PATCH | `/api/family/:familyId/todos/:todoId/complete` | 标记完成 | 成员 |
| 29 | PATCH | `/api/family/:familyId/todos/:todoId/incomplete` | 取消完成 | 成员 |
| 30 | DELETE | `/api/family/:familyId/todos/:todoId` | 删除待办 | 创建人/房主 |
| | | **公告** | | |
| 31 | GET | `/api/family/:familyId/announcements` | 公告列表 | 成员 |
| 32 | GET | `/api/family/:familyId/announcements/:id` | 公告详情 | 成员 |
| 33 | POST | `/api/family/:familyId/announcements` | 发布公告 | 房主 |
| 34 | DELETE | `/api/family/:familyId/announcements/:id` | 删除公告 | 房主 |
| | | **概览** | | |
| 35 | GET | `/api/family/:familyId/dashboard` | 首页概览 | 成员 |
| | | **用户** | | |
| 36 | PUT | `/api/user/profile` | 更新资料 | 登录 |
| 37 | GET | `/api/user/settings` | 获取设置 | 登录 |
| 38 | PUT | `/api/user/settings` | 更新设置 | 登录 |

---

## 九、补充说明

### 9.1 权限校验
- **登录（login）**：仅需携带有效 accessToken
- **家庭成员（member）**：需验证当前用户属于该 familyId
- **房主（owner）**：需验证当前用户是该家庭的 ownerId

### 9.2 家庭上下文
- 大部分接口需要 `familyId` 路径参数
- 前端会在登录后获取 `currentFamilyId` 并存储
- 切换家庭时调用 `/switch` 接口更新服务端记录

### 9.3 邀请码规则
- 6 位大写字母 + 数字组合（排除易混淆字符 0/O/1/I/L）
- 有效期默认 7 天
- 每次生成新邀请码，旧邀请码立即失效
- 一期加入不需要审核，凭邀请码直接加入

### 9.4 待办权限
- 所有家庭成员可创建待办
- 标记完成/取消完成：所有成员可操作
- 编辑/删除：创建人或房主可操作
- 已完成的待办不可编辑（需先标记为未完成）

### 9.5 一期暂不实现的接口（预留）
- 加入审核流程（3.5-3.7）
- 扫码加入
- 自定义头像上传
- 公告图片附件
- 待办重复周期
