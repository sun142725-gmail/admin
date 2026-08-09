# Change Proposal: 家庭大事纪服务端接口

## Requirement Background
移动端已完成 `mobile/docs/MILESTONE_API.md` 和 `mobile/docs/MILESTONE_DEV.md`，明确需要家庭大事纪的后端模型、权限规则和接口能力。现有后端已有家庭、成员、待办、公告模块，需要在同一服务边界内补齐大事纪接口，保证移动端可以直接联调。

## Product Analysis

### Target Users and Scenarios
- **User Groups:** 家庭 H5 用户、家庭房主、普通家庭成员
- **Usage Scenarios:** 用户记录个人成长节点，家庭成员记录家庭重大事件，房主维护家庭核心事件并生成碑文汇总
- **Core Pain Points:** 移动端已有页面规划但服务端缺少数据存储、权限校验和 REST API

### Value Proposition and Success Metrics
- **Value Proposition:** 让家庭大事纪从静态文档进入可用功能闭环
- **Success Metrics:** 移动端文档中 7 个接口可通过 JWT 调用，权限矩阵由后端强制执行

### Humanistic Care
个人事件仅创建人可编辑和标记核心，家庭成员可只读查看，兼顾家庭共同记忆与个人边界。

## Change Content
1. 新增 `family_milestones` 实体，保存家庭大事纪事件。
2. 新增大事纪 DTO、Controller 路由和 Service 业务逻辑。
3. 同步知识库 API、数据模型和 Family 模块文档。

## Impact Scope
- **Modules:** backend family, helloagents knowledge base
- **Files:** `backend/src/common/entities/*`, `backend/src/modules/family/*`, `backend/src/app.module.ts`
- **APIs:** `/api/family/:familyId/milestones*`
- **Data:** 新增 `family_milestones` 表

## Core Scenarios

### Requirement: 家庭大事纪接口
**Module:** family
为移动端家庭大事纪页面提供列表、详情、创建、更新、删除、核心标记和碑文汇总能力。

#### Scenario: 家庭成员查看大事纪
同家庭成员访问列表、详情和碑文汇总时：
- 返回指定家庭和类型的大事纪数据
- 非家庭成员被拒绝访问

#### Scenario: 创建和维护大事纪
家庭成员创建事件时：
- `creatorId` 从 JWT 当前用户获取
- 个人事件自动关联本人
- 家庭事件关联成员必须属于当前家庭

#### Scenario: 权限控制
编辑、删除和核心标记变更时：
- 个人事件仅创建人可操作
- 家庭事件编辑/删除允许创建人或房主
- 家庭事件核心标记仅房主可操作

## Risk Assessment
- **Risk:** 新增数据表依赖 `DB_SYNC=true` 或后续迁移脚本生效。
- **Mitigation:** 实体注册到 TypeORM；本次不执行生产数据库变更，部署前需确认迁移策略。
