# Log Center

## Purpose
打点日志、前端日志与错误日志的统一存储与查询

## Module Overview
- **Responsibility:** 批量上报、分页查询、traceId/sessionId 链路追踪、7 天留存清理
- **Status:** ✅Stable
- **Last Updated:** 2026-01-25
- **Menu:** 日志管理 / 打点日志 / 前端日志 / 错误日志

## Specifications

### Requirement: 批量日志上报
**Module:** log-center
前端合并 PV/日志/错误日志批量上报。

#### Scenario: 批量提交
- 接收 events 数组
- 按类型分表写入

### Requirement: 链路追踪查询
**Module:** log-center
支持 traceId/sessionId 查询与 7 天内数据范围限制。

#### Scenario: traceId 查询
- 通过 traceId 聚合前端日志与打点事件
- 端来源使用字典 `source_type` 展示

### Requirement: 7 天留存
**Module:** log-center
定时清理 7 天之前的打点/前端/错误日志。

#### Scenario: 定时任务清理
- 每日定时删除过期日志

## API Interfaces
### POST /api/log-center/events
**Description:** 批量上报日志事件
**Input:** source, sessionId, events
**Output:** accepted

### GET /api/log-center
**Description:** 日志分页查询
**Input:** type, page, pageSize, traceId, sessionId, userId, pageCode, keyword, start, end
**Output:** items, total

### GET /api/log-center/:type/:id
**Description:** 日志详情
**Input:** type, id
**Output:** 详情数据

## Data Models
### track_logs
| Field | Type | Description |
|-------|------|-------------|
| user_id | bigint | 用户 ID |
| trace_id | varchar | 链路 ID |
| session_id | varchar | 会话 ID |
| source | varchar | 端来源 |
| page_code | varchar | 页面码 |
| path | varchar | 路径 |

### frontend_logs
| Field | Type | Description |
|-------|------|-------------|
| user_id | bigint | 用户 ID |
| trace_id | varchar | 链路 ID |
| session_id | varchar | 会话 ID |
| source | varchar | 端来源 |
| level | varchar | 日志级别 |
| category | varchar | 日志分类 |
| message | varchar | 日志内容 |

### error_logs
| Field | Type | Description |
|-------|------|-------------|
| user_id | bigint | 用户 ID |
| trace_id | varchar | 链路 ID |
| session_id | varchar | 会话 ID |
| source | varchar | 端来源 |
| message | varchar | 错误内容 |

## Dependencies
- auth

## Change History
- [202601251534_log_center_enhance](../../history/2026-01/202601251534_log_center_enhance/) - 日志中心增强与批量上报
- [202601251636_log_menu_split](../../history/2026-01/202601251636_log_menu_split/) - 日志菜单拆分入口
