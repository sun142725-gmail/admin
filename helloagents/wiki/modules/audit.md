# Audit

## Purpose
审计日志记录

## Module Overview
- **Responsibility:** 记录登录与增删改等操作
- **Status:** ✅Stable
- **Last Updated:** 2025-01-25

## Specifications

### Requirement: 审计日志
**Module:** audit
记录登录、用户/角色/权限的增删改操作。

#### Scenario: 登录日志
- 记录用户ID、IP 与结果

#### Scenario: 变更日志
- 记录模块、动作与详情

## API Interfaces
### GET /api/audit-logs
**Description:** 审计日志列表
**Input:** page, pageSize
**Output:** 日志分页数据

## Data Models
### audit_logs
| Field | Type | Description |
|-------|------|-------------|
| action | varchar | 动作类型 |
| detail | text | 详情 |

## Dependencies
- users

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化审计模块
