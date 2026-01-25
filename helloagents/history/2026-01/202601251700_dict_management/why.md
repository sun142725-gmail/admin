# 变更提案：字典管理与多端枚举查询

## 需求背景
现有系统缺少统一字典管理，前端与业务侧枚举分散，难以维护与多语言支持。B/C 端需要支持一次性按多个字典 code 查询，减少请求数量并提升性能。

## Product Analysis

### Target Users and Scenarios
- **User Groups:** 平台管理员、业务配置人员、B/C 端前端与业务服务调用方
- **Usage Scenarios:** 管理端维护枚举与多语言；客户端批量获取枚举并缓存
- **Core Pain Points:** 枚举分散、多语言维护成本高、请求过多

### Value Proposition and Success Metrics
- **Value Proposition:** 统一字典管理与多语言枚举查询，提升配置效率与一致性
- **Success Metrics:** 字典维护入口覆盖率 100%；批量查询平均请求数减少 50%+

### Humanistic Care
字典内容支持多语言与可读描述，避免信息不对称造成理解偏差。

## 变更内容
1. 新增字典管理模块（字典/字典项 CRUD、详情）。
2. 支持多语言字典项与批量按 code 查询 `{ [code]: items[] }`。
3. 新增系统配置菜单分组，字典管理归类其中。
4. 引入 Redis 缓存，提供推荐的失效与刷新策略。

## 影响范围
- **Modules:** dict、resources、frontend、seed
- **Files:** 后端模块/实体/缓存封装，前端页面/接口/路由
- **APIs:** 字典管理与批量查询接口
- **Data:** 新增字典与字典项数据表

## 核心场景

### Requirement: 字典管理
**Module:** dict
提供字典列表、详情与新增/编辑/删除。

#### Scenario: 字典维护
管理员创建字典并维护字典项
- 支持启用/禁用
- 支持多语言字段

### Requirement: 批量字典查询
**Module:** dict
B/C 端一次请求获取多个 code 的字典数据。

#### Scenario: 多 code 查询
- 输入多个字典 code
- 返回 `{ [code]: items[] }` 结构

### Requirement: Redis 缓存
**Module:** dict
缓存字典查询结果，减少重复请求。

#### Scenario: 缓存失效
- 管理端变更字典后失效对应缓存
- 设置合理 TTL，避免长期脏数据

## 风险评估
- **风险:** 缓存一致性问题
  - **Mitigation:** 变更后主动失效 + TTL 兜底
- **风险:** 多语言字段结构不统一
  - **Mitigation:** 明确字段规范与校验规则
