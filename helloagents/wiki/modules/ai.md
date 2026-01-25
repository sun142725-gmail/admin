# AI

## Purpose
提供 AI 解卦服务与供应商适配

## Module Overview
- **Responsibility:** 调用 DeepSeek/OpenAI 生成解卦内容
- **Status:** ✅Stable
- **Last Updated:** 2026-01-25

## Specifications

### Requirement: AI 解卦
**Module:** ai
根据六爻结果生成解卦文本。

#### Scenario: 解卦调用
- 输入主题与六爻结果
- 返回简要解读

## API Interfaces
### POST /api/ai/interpret
**Description:** AI 解卦
**Input:** topic, lines
**Output:** interpretation

## Data Models
- 无

## Dependencies
- 无

## Change History
- [202601251127_divination_ai](../../history/2026-01/202601251127_divination_ai/) - 新增 AI 模块
