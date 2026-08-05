# 家庭协作后端模块

## Background
移动端家庭管理应用文档定义了家庭创建/加入、成员管理、家务待办、公告、首页概览和用户设置接口，后端需要提供匹配的一期服务端能力。

## Objectives
- 按 `mobile/docs/API_SPEC.md` 实现 `/api/family/*` 核心接口
- 补齐 `/api/user/profile` 与 `/api/user/settings`
- 复用现有 JWT 鉴权与统一响应结构
- 同步知识库记录新增模块

## Success Criteria
- 后端构建通过
- 家庭成员与房主权限按文档约束执行
- 数据模型可由 TypeORM 同步生成
