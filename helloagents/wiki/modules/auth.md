# Auth

## Purpose
登录、刷新、验证码登录注册与鉴权模块

## Module Overview
- **Responsibility:** 处理用户名密码登录、验证码登录注册、验证码重置密码、刷新、退出与权限校验
- **Status:** ✅Stable
- **Last Updated:** 2026-07-19

## Specifications

### Requirement: 认证与刷新
**Module:** auth
支持登录、刷新令牌、验证码登录注册与验证码重置密码。

#### Scenario: 登录
- 输入用户名/密码
- 返回 accessToken 与 refreshToken

#### Scenario: 验证码登录/注册
- 手机号或邮箱 + 验证码登录
- 未绑定标识时自动注册并发放 token

#### Scenario: 验证码重置密码
- 手机号或邮箱 + 验证码重置密码
- 重置后提升 tokenVersion 使旧 token 失效

#### Scenario: 刷新
- 仅允许 refreshToken 调用刷新接口
- 返回新 accessToken 与 refreshToken

## API Interfaces
### POST /api/auth/login
**Description:** 用户登录
**Input:** username, password
**Output:** accessToken, refreshToken, profile

### POST /api/auth/code/send
**Description:** 发送短信/邮件验证码
**Input:** channel, scene, target
**Output:** success, code(非生产环境返回)

### POST /api/auth/code/login
**Description:** 验证码登录/未注册自动注册
**Input:** channel, target, code
**Output:** accessToken, refreshToken, profile

### POST /api/auth/code/reset-password
**Description:** 验证码重置密码
**Input:** channel, target, code, newPassword
**Output:** success

### POST /api/auth/refresh
**Description:** 刷新令牌
**Input:** refreshToken
**Output:** accessToken, refreshToken

### POST /api/auth/logout
**Description:** 退出登录
**Input:** -
**Output:** success

### GET /api/auth/profile
**Description:** 获取用户信息与权限码
**Input:** -
**Output:** 用户 profile

## Data Models
### users
| Field | Type | Description |
|-------|------|-------------|
| token_version | int | 刷新令牌版本号 |
| user_type | varchar | 账号类型 |
| register_channel | varchar | 注册来源 |
| last_login_at | datetime | 最近登录时间 |

### user_identifiers
| Field | Type | Description |
|-------|------|-------------|
| identifier_type | varchar | phone/email |
| identifier_value | varchar | 手机号/邮箱 |
| verified_at | datetime | 验证时间 |

### verification_codes
| Field | Type | Description |
|-------|------|-------------|
| scene | varchar | login/register/reset_password |
| channel | varchar | sms/email |
| target | varchar | 目标手机号/邮箱 |
| code_hash | varchar | 验证码哈希 |

## Dependencies
- users
- user_identifiers
- verification_codes
- roles
- permissions

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化认证模块
