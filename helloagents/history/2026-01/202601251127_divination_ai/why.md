# 变更提案: 六爻占卜与 AI 解卦模块

## 需求背景
现有系统缺少面向用户的占卜与 AI 解读能力，需要新增可记录主题、自动生成六爻并调用 AI 解卦的完整流程。

## 产品分析

### 目标用户与场景
- **用户群体:** 需要占卜与解读的普通用户、运营人员
- **使用场景:** 输入主题进行占卜，查看自动解卦结果并保存记录
- **核心痛点:** 无统一流程、占卜结果不可追溯、缺少 AI 解读

### 价值主张与成功指标
- **价值主张:** 统一占卜与 AI 解卦流程，提供可追溯记录与可视化展示
- **成功指标:** 可创建主题、生成六爻、AI 解读、动画展示结果

### 人文关怀
对用户输入主题与解读内容进行数据保护，不在日志中输出敏感信息。

## 变更内容
1. 新增六爻占卜模块（主题、结果、过程）
2. 新增 AI 模块（DeepSeek + OpenAI）统一调用与兜底
3. 前端增加占卜页面与动画展示
4. 数据落库可追溯

## 影响范围
- **模块:** Divination, AI, Frontend
- **文件:** backend/src/modules/divination/*, backend/src/modules/ai/*, frontend/src/pages/divination/*
- **API:** /api/divinations, /api/ai/interpret
- **数据:** divinations, divination_lines

## 核心场景

### Requirement: 占卜主题记录
**Module:** divination
用户输入主题，生成并保存本次占卜记录。

#### Scenario: 新建占卜
输入主题，创建占卜记录并生成六爻结果。
- 返回六爻结果与 ID

### Requirement: 占卜结果生成与 AI 解卦
**Module:** divination/ai
后端生成六爻并调用 AI 生成解卦文本。

#### Scenario: AI 解卦
生成六爻后调用 AI，返回解读文本并保存。
- 失败时返回兜底文案

### Requirement: 动画展示与结果呈现
**Module:** frontend
前端展示占卜过程动画，动画结束后显示结果与解读。

#### Scenario: 动画流程
展示破碗 + 三枚铜钱动画（占位图也可）后展示结果。

## 风险评估
- **风险:** AI 调用失败导致解读缺失
- **缓解:** 统一 AI 模块 + 兜底文案 + 限流
