# Dict

## Purpose
字典与字典项管理，提供多语言枚举查询

## Module Overview
- **Responsibility:** 字典 CRUD、多语言字典项、批量查询与缓存
- **Status:** ✅Stable
- **Last Updated:** 2026-01-25
- **Menu:** 系统配置 / 字典管理

## Specifications

### Requirement: 字典管理
**Module:** dict
提供字典列表、详情与增删改。

#### Scenario: 字典维护
- 管理端维护字典与字典项
- 支持启用/禁用与多语言字段
- 内置 `source_type` 作为端来源枚举

### Requirement: 批量字典查询
**Module:** dict
按多个 code 批量查询枚举。

#### Scenario: 多 code 查询
- 输入多个 code
- 返回 `{ [code]: items[] }`

### Requirement: Redis 缓存
**Module:** dict
缓存字典查询结果并支持失效。

#### Scenario: 缓存失效
- 变更字典后删除缓存
- TTL 兜底自动过期

## API Interfaces
### GET /api/dicts
**Description:** 字典列表
**Input:** page, pageSize, keyword, status
**Output:** items, total

### GET /api/dicts/batch
**Description:** 批量字典查询
**Input:** codes, lang
**Output:** { [code]: items[] }

### GET /api/dicts/:code
**Description:** 字典详情
**Input:** code
**Output:** dict + items

### POST /api/dicts
**Description:** 新增字典
**Input:** code, name, description, status
**Output:** dict

### PATCH /api/dicts/:id
**Description:** 更新字典
**Input:** name, description, status
**Output:** dict

### DELETE /api/dicts/:id
**Description:** 删除字典
**Input:** id
**Output:** void

### POST /api/dicts/:id/items
**Description:** 新增字典项
**Input:** value, label, labelI18n, sortOrder, status, extra
**Output:** item

### PATCH /api/dict-items/:id
**Description:** 更新字典项
**Input:** value, label, labelI18n, sortOrder, status, extra
**Output:** item

### DELETE /api/dict-items/:id
**Description:** 删除字典项
**Input:** id
**Output:** void

## Data Models
### dicts
| Field | Type | Description |
|-------|------|-------------|
| code | varchar | 字典编码 |
| name | varchar | 字典名称 |
| description | varchar | 描述 |
| status | tinyint | 状态 |

### dict_items
| Field | Type | Description |
|-------|------|-------------|
| dict_id | bigint | 字典ID |
| value | varchar | 枚举值 |
| label | varchar | 默认语言标签 |
| label_i18n | json | 多语言标签 |
| sort_order | int | 排序 |
| status | tinyint | 状态 |

## Dependencies
- resources

## Change History
- [202601251700_dict_management](../../history/2026-01/202601251700_dict_management/) - 字典管理与多语言枚举查询
