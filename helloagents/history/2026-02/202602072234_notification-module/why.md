# Change Proposal: 通知管理模块

## Requirement Background
当前系统缺少统一的通知管理能力，通知模板与发送渠道不可配置，导致消息分发与追踪困难。本次新增通知管理模块，首期支持站内信与飞书，并建立模板变量体系与发送追踪能力，以满足业务沟通与可追溯性需求。

## Product Analysis

### Target Users and Scenarios
- **User Groups:** 系统管理员、业务运营人员
- **Usage Scenarios:** 站内运营通知、系统事件通知、业务进度通知
- **Core Pain Points:** 模板复用困难、变量无法动态渲染、发送状态不可追踪、失败重试缺乏统一入口

### Value Proposition and Success Metrics
- **Value Proposition:** 统一模板与通道管理，提升通知发送效率与可追溯性
- **Success Metrics:** 模板复用率提升、通知发送成功率可观测、失败重试可控

### Humanistic Care
避免在通知内容中泄露敏感信息，支持按权限控制通知发送与查看范围。

## Change Content
1. 新增通知模板管理，支持富文本变量插入
2. 新增通知发送与通道管理，首期支持站内信与飞书
3. 新增发布记录、状态追踪与手动重试能力
4. 与权限管理集成，非管理员权限由权限模块配置

## Impact Scope
- **Modules:** notification（新模块）、auth/permissions（权限依赖）
- **Files:** backend/src/modules/notification/**，frontend/src/pages/notification/**，frontend/src/api/notification.ts
- **APIs:** 通知模板管理、通知发送、发布记录、状态查询、重试
- **Data:** 通知模板、通知任务、通知消息、发布记录

## Core Scenarios

### Requirement: 通知模板管理
**Module:** notification
支持创建、编辑、停用通知模板，模板内容为富文本并支持变量插入与预览。

#### Scenario: 富文本变量插入
编辑模板时可在富文本中插入变量占位符，保存后渲染时按变量规则替换。
- 预置变量：用户昵称、事件信息、系统参数
- 自定义变量：在模板上定义 key 与说明

### Requirement: 通知发送与通道管理
**Module:** notification
支持选择通道发送通知，首期提供站内信与飞书通道。

#### Scenario: 多通道发布
选择模板与通道发布通知，系统生成发布记录并追踪状态。
- 站内信立即入库
- 飞书通过通道适配器发送

### Requirement: 发布记录与状态追踪
**Module:** notification
记录每次发布的状态、失败原因与重试行为。

#### Scenario: 手动重试
当发送失败时，支持在记录中触发手动重试并记录结果。

## Risk Assessment
- **Risk:** 发送重试导致重复通知
- **Mitigation:** 通道层实现幂等标识与发送记录去重
