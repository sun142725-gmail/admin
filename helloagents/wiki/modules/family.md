# Family

## Purpose
移动端家庭协作模块，支持家庭创建/加入、成员管理、家务待办、家庭公告、首页概览与移动端用户设置。

## Module Overview
- **Responsibility:** 承载 `mobile/docs/API_SPEC.md` 中 `/api/family/*` 与 `/api/user/*` 一期接口
- **Status:** ✅Stable
- **Last Updated:** 2026-08-05

## Specifications

### Requirement: 家庭协作一期
**Module:** family
为家庭管理 H5 提供服务端数据模型与接口。

#### Scenario: 家庭与成员
- 登录用户可创建家庭并自动成为房主
- 用户可通过 6 位邀请码直接加入家庭
- 家庭人数上限为 20 人
- 房主可更新家庭、生成邀请码、管理成员；普通成员可查看与退出家庭

#### Scenario: 家务待办
- 家庭成员可创建待办并分配给家庭成员
- 已完成待办不可编辑
- 待办编辑/删除仅限创建人或房主
- 完成/取消完成允许家庭成员操作

#### Scenario: 家庭公告
- 家庭成员可查看公告
- 仅房主可发布和删除公告

#### Scenario: 概览与设置
- Dashboard 聚合家庭、成员、统计、最新公告和最新待办
- `/api/user/profile` 支持移动端资料更新
- `/api/user/settings` 支持通知开关

## API Interfaces
- `POST /api/family/create`
- `POST /api/family/join`
- `GET /api/family/list`
- `GET /api/family/:familyId/detail`
- `PUT /api/family/:familyId/update`
- `DELETE /api/family/:familyId`
- `POST /api/family/:familyId/switch`
- `POST /api/family/:familyId/invite-code`
- `GET /api/family/:familyId/invite-code`
- `GET /api/family/:familyId/members`
- `PUT /api/family/:familyId/members/:memberId`
- `DELETE /api/family/:familyId/members/:memberId`
- `POST /api/family/:familyId/leave`
- `GET /api/family/:familyId/join-requests`
- `POST /api/family/:familyId/join-requests/:requestId/approve`
- `POST /api/family/:familyId/join-requests/:requestId/reject`
- `GET /api/family/:familyId/todos`
- `GET /api/family/:familyId/todos/:todoId`
- `POST /api/family/:familyId/todos`
- `PUT /api/family/:familyId/todos/:todoId`
- `PATCH /api/family/:familyId/todos/:todoId/complete`
- `PATCH /api/family/:familyId/todos/:todoId/incomplete`
- `DELETE /api/family/:familyId/todos/:todoId`
- `GET /api/family/:familyId/announcements`
- `GET /api/family/:familyId/announcements/:announcementId`
- `POST /api/family/:familyId/announcements`
- `DELETE /api/family/:familyId/announcements/:announcementId`
- `GET /api/family/:familyId/dashboard`
- `PUT /api/user/profile`
- `GET /api/user/settings`
- `PUT /api/user/settings`

## Data Models
### families
| Field | Type | Description |
|-------|------|-------------|
| name | varchar | 家庭名称 |
| avatar | varchar | 内置头像标识 |
| owner_id | int | 房主用户 ID |

### family_members
| Field | Type | Description |
|-------|------|-------------|
| family_id | int | 家庭 ID |
| user_id | int | 用户 ID |
| nickname | varchar | 家庭内昵称 |
| role | varchar | owner/member |
| joined_at | datetime | 加入时间 |

### family_invite_codes
| Field | Type | Description |
|-------|------|-------------|
| code | varchar | 6 位邀请码 |
| family_id | int | 家庭 ID |
| expires_at | datetime | 过期时间 |
| is_active | tinyint | 是否有效 |

### family_todos
| Field | Type | Description |
|-------|------|-------------|
| title | varchar | 待办标题 |
| creator_id | int | 创建人 |
| assignee_id | int | 执行人 |
| due_date | date | 截止日期 |
| status | varchar | pending/completed |
| completed_at | datetime | 完成时间 |

### family_announcements
| Field | Type | Description |
|-------|------|-------------|
| title | varchar | 公告标题 |
| content | varchar | 公告正文 |
| publisher_id | int | 发布人 |
| published_at | datetime | 发布时间 |

### user_settings
| Field | Type | Description |
|-------|------|-------------|
| user_id | int | 用户 ID |
| current_family_id | int | 当前活跃家庭 |
| notification_enabled | tinyint | 通知开关 |

## Dependencies
- users
- user_identifiers
- jwt auth guard

## Change History
- [2026-08-05] 新增家庭协作一期后端模块
- [2026-08-05] 家庭成员默认昵称限制在 20 字符内，避免长账号名写入失败
- [2026-08-05] 移动端资料更新允许提交空头像地址
