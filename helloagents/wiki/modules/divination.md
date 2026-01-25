# Divination

## Purpose
六爻占卜流程与结果管理

## Module Overview
- **Responsibility:** 占卜主题记录、六爻生成、结果查询
- **Status:** ✅Stable
- **Last Updated:** 2026-01-25
- **Menu:** 工具 / 六爻占卜

## Specifications

### Requirement: 占卜主题记录
**Module:** divination
创建占卜主题并生成六爻结果。

#### Scenario: 新建占卜
- 输入主题生成六爻
- 返回占卜结果与解卦

## API Interfaces
### POST /api/divinations
**Description:** 新建占卜
**Input:** topic
**Output:** id, topic, lines, interpretation

### GET /api/divinations/:id
**Description:** 查询占卜记录
**Input:** id
**Output:** 占卜详情

## Data Models
### divinations
| Field | Type | Description |
|-------|------|-------------|
| topic | varchar | 占卜主题 |
| interpretation | text | 解卦内容 |

### divination_lines
| Field | Type | Description |
|-------|------|-------------|
| line_index | int | 爻序 |
| sign_str | varchar | 符号串 |
| name | varchar | 老阳/老阴/少阳/少阴 |

## Dependencies
- ai

## Change History
- [202601251127_divination_ai](../../history/2026-01/202601251127_divination_ai/) - 新增占卜模块
