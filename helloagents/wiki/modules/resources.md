# Resources

## Purpose
菜单/页面资源管理

## Module Overview
- **Responsibility:** 菜单树管理、资源与权限码绑定
- **Status:** ✅Stable
- **Last Updated:** 2025-01-25

## Specifications

### Requirement: 菜单树与资源
**Module:** resources
后端返回菜单树与权限码，前端动态生成菜单。

#### Scenario: 获取菜单树
- 返回树形菜单结构
- 每个节点绑定 permission_code

## API Interfaces
### GET /api/resources/tree
**Description:** 获取菜单树
**Input:** 无
**Output:** 菜单树结构

### POST /api/resources
**Description:** 新增资源/菜单
**Input:** name, type, path, parentId, permissionCode
**Output:** 资源详情

### PATCH /api/resources/:id
**Description:** 编辑资源/菜单
**Input:** name, type, path, parentId, permissionCode
**Output:** 资源详情

### DELETE /api/resources/:id
**Description:** 删除资源/菜单
**Input:** -
**Output:** success

## Data Models
### resources
| Field | Type | Description |
|-------|------|-------------|
| type | varchar | menu/page/button |
| permission_code | varchar | 绑定权限码 |

## Dependencies
- permissions

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化资源模块
