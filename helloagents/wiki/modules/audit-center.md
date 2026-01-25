# Audit Center

## Purpose
操作日志中心

## Module Overview
- **Responsibility:** 审计日志分页查询、筛选与详情展示
- **Menu:** 日志管理 / 审计日志
- **Status:** ✅Stable
- **Last Updated:** 2026-01-25

## Specifications

### Requirement: 日志中心查询
**Module:** audit-center
支持分页、按用户/模块/时间筛选与详情查看。

#### Scenario: 日志筛选
- 按用户ID、模块、时间范围筛选

## API Interfaces
### GET /api/audit-center
**Description:** 日志分页查询
**Input:** page, pageSize, userId, module, start, end
**Output:** 日志分页数据

### GET /api/audit-center/:id
**Description:** 日志详情
**Input:** id
**Output:** 日志详情

## Data Models
### audit_logs
| Field | Type | Description |
|-------|------|-------------|
| module | varchar | 模块 |
| action | varchar | 动作 |
| detail | text | 详情 |

## Dependencies
- audit

## Change History
- [202601251353_profile_audit_center](../../history/2026-01/202601251353_profile_audit_center/) - 新增日志中心模块
- [202601251534_log_center_enhance](../../history/2026-01/202601251534_log_center_enhance/) - 日志中心页面扩展
- [202601251636_log_menu_split](../../history/2026-01/202601251636_log_menu_split/) - 审计日志菜单独立
