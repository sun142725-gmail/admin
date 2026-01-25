# Auth

## Purpose
登录、刷新与鉴权模块

## Module Overview
- **Responsibility:** 处理登录、刷新、退出与权限校验
- **Status:** ✅Stable
- **Last Updated:** 2025-01-25

## Specifications

### Requirement: 认证与刷新
**Module:** auth
支持登录、刷新令牌与获取用户信息。

#### Scenario: 登录
- 输入用户名/密码
- 返回 accessToken 与 refreshToken

#### Scenario: 刷新
- 仅允许 refreshToken 调用刷新接口
- 返回新 accessToken 与 refreshToken

## API Interfaces
### POST /api/auth/login
**Description:** 用户登录
**Input:** username, password
**Output:** accessToken, refreshToken, profile

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

## Dependencies
- users
- roles
- permissions

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化认证模块
