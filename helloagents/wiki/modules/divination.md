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
- 不带主题创建（先摇卦后述事）：生成六爻立即返回，成卦后经 PATCH topic 补填所问之事再解卦
- 带主题创建（旧用法兼容）：直接进入解卦流程

## API Interfaces
### POST /api/divinations
**Description:** 新建占卜（立即返回六爻与卦名，不等待 AI）
**Input:** topic 可选（缺省时 status 为 casting，待补填主题）
**Output:** id, topic, status, hexagramName, changedHexagramName, lines
### PATCH /api/divinations/:id/topic
**Description:** 补填所问之事（成卦后、解卦前；casting → interpreting）
**Input:** topic（1~50 字）
**Output:** 更新后的占卜记录
### GET /api/divinations
**Description:** 当前用户占卜历史（分页摘要）
**Input:** page, pageSize
**Output:** items, total, page, pageSize
### GET /api/divinations/:id
**Description:** 占卜详情（含解卦状态与结果）
**Input:** id
**Output:** 占卜详情（含 status / interpretation）
### GET /api/divinations/:id/interpretation/stream
**Description:** SSE 流式解卦，事件类型 chunk（增量文本）/ done（完成）/ error（失败）；跳过统一响应包装；服务端负责调用 AI 并落库
**Input:** id
**Output:** text/event-stream
### POST /api/divinations/:id/reinterpret
**Description:** 重新解读（失败或旧记录重入解卦流程）
**Input:** id
**Output:** success
### DELETE /api/divinations/:id
**Description:** 删除自己的占卜记录
**Input:** id
**Output:** success

## Data Models
### divinations
| Field | Type | Description |
|-------|------|-------------|
| topic | varchar | 占卜主题 |
| interpretation | text | 解卦内容 |
| status | varchar(16) | casting / interpreting / completed / failed，旧数据默认 completed |
| hexagram_name | varchar(64) | 本卦名，如"地天泰" |
| changed_hexagram_name | varchar(64) | 变卦名（有动爻时） |
| error_message | varchar(255) | 解卦失败原因 |

### divination_lines
| Field | Type | Description |
|-------|------|-------------|
| line_index | int | 爻序 |
| sign_str | varchar | 符号串 |
| name | varchar | 老阳/老阴/少阳/少阴 |

## Dependencies
- ai

## Change History
- [2026-09-20 divination_redesign](../../plan/divination_redesign.md) - 三幕式重构 + 异步 SSE 流式解卦 + 卦名/变卦推算 + 历史管理 + 先摇卦后述事
- [202601251127_divination_ai](../../history/2026-01/202601251127_divination_ai/) - 新增占卜模块
