# Roles

## Purpose
角色管理与权限分配

## Module Overview
- **Responsibility:** 角色 CRUD、绑定权限、查看绑定用户
- **Status:** ✅Stable
- **Last Updated:** 2025-01-25

## Specifications

### Requirement: 角色管理
**Module:** roles
提供角色列表、新增、编辑、删除、分配权限。

#### Scenario: 分配权限
- 角色可绑定多个权限码

## API Interfaces
### POST /api/roles/:id/permissions
**Description:** 分配权限
**Input:** permissionIds
**Output:** 绑定结果

### GET /api/roles
**Description:** 角色列表
**Input:** page, pageSize
**Output:** 角色分页数据

### POST /api/roles
**Description:** 新增角色
**Input:** name, code, description
**Output:** 角色详情

### PATCH /api/roles/:id
**Description:** 编辑角色
**Input:** name, description
**Output:** 角色详情

### DELETE /api/roles/:id
**Description:** 删除角色
**Input:** -
**Output:** success

### GET /api/roles/:id/users
**Description:** 查看角色绑定用户
**Input:** -
**Output:** 用户列表

## Data Models
### roles
| Field | Type | Description |
|-------|------|-------------|
| code | varchar | 角色编码 |

## Dependencies
- permissions
- users

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化角色模块
