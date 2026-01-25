# Users

## Purpose
用户管理与角色分配

## Module Overview
- **Responsibility:** 用户 CRUD、禁用/重置密码/分配角色
- **Status:** ✅Stable
- **Last Updated:** 2025-01-25

## Specifications

### Requirement: 用户管理
**Module:** users
提供用户列表、新增、编辑、禁用、删除、重置密码。

#### Scenario: 用户列表
- 支持分页与关键字段展示
- 可筛选状态

#### Scenario: 分配角色
- 为用户绑定多个角色

## API Interfaces
### GET /api/users
**Description:** 用户列表
**Input:** page, pageSize
**Output:** 用户分页数据

### POST /api/users
**Description:** 新增用户
**Input:** username, password, nickname, email
**Output:** 用户详情

### PATCH /api/users/:id
**Description:** 编辑用户
**Input:** nickname, email, status
**Output:** 用户详情

### PATCH /api/users/:id/disable
**Description:** 禁用用户
**Input:** -
**Output:** success

### DELETE /api/users/:id
**Description:** 删除用户
**Input:** -
**Output:** success

### POST /api/users/:id/reset-password
**Description:** 重置密码
**Input:** password
**Output:** success

### POST /api/users/:id/roles
**Description:** 分配角色
**Input:** roleIds
**Output:** success

## Data Models
### users
| Field | Type | Description |
|-------|------|-------------|
| status | tinyint | 启用状态 |

## Dependencies
- roles

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化用户模块
