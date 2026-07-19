# Profile

## Purpose
个人中心资料与密码管理

## Module Overview
- **Responsibility:** 用户资料查看与更新、密码修改、头像上传
- **Status:** ✅Stable
- **Last Updated:** 2026-07-19

## Specifications

### Requirement: 个人中心
**Module:** profile
提供资料修改、改密与头像上传。

#### Scenario: 编辑资料
- 更新昵称/邮箱/头像

#### Scenario: 修改密码
- 校验旧密码
- 更新密码并失效旧 token

#### Scenario: 头像上传
- 支持上传到公共文件存储目录
- 业务层以 `bizType` 或路径前缀区分文件用途

## API Interfaces
### GET /api/profile
**Description:** 获取个人资料
**Input:** -
**Output:** 用户资料

### PATCH /api/profile
**Description:** 更新资料
**Input:** nickname, email, avatarUrl
**Output:** 更新后的资料

### POST /api/profile/password
**Description:** 修改密码
**Input:** oldPassword, newPassword
**Output:** success

### POST /api/profile/avatar
**Description:** 上传头像
**Input:** multipart file
**Output:** avatarUrl

### POST /api/files/upload
**Description:** 公共文件上传
**Input:** multipart file, bizType
**Output:** url, id

## Data Models
### users
| Field | Type | Description |
|-------|------|-------------|
| avatar_url | varchar | 头像地址 |
| user_type | varchar | 账号类型 |
| register_channel | varchar | 注册来源 |
| last_login_at | datetime | 最近登录时间 |

### file_assets
| Field | Type | Description |
|-------|------|-------------|
| biz_type | varchar | 文件业务类型 |
| storage_path | varchar | 存储路径 |
| uploaded_by | bigint | 上传人 |

## Dependencies
- users
- file_assets

## Change History
- [202601251353_profile_audit_center](../../history/2026-01/202601251353_profile_audit_center/) - 新增个人中心模块
