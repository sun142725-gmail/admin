# Permissions

## Purpose
权限码管理

## Module Overview
- **Responsibility:** 权限码 CRUD、唯一性校验
- **Status:** ✅Stable
- **Last Updated:** 2025-01-25

## Specifications

### Requirement: 权限码管理
**Module:** permissions
维护权限码与描述，权限码唯一。

#### Scenario: 新增权限
- 录入权限名称与 code
- code 唯一校验

## API Interfaces
### POST /api/permissions
**Description:** 新增权限
**Input:** name, code, description
**Output:** 权限详情

### GET /api/permissions
**Description:** 权限列表
**Input:** page, pageSize
**Output:** 权限分页数据

### PATCH /api/permissions/:id
**Description:** 编辑权限
**Input:** name, description
**Output:** 权限详情

### DELETE /api/permissions/:id
**Description:** 删除权限
**Input:** -
**Output:** success

## Data Models
### permissions
| Field | Type | Description |
|-------|------|-------------|
| code | varchar | 权限码 |

## Dependencies
- roles

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化权限模块
