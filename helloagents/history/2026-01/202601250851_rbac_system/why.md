# 变更提案: 企业级 RBAC 权限管理系统

## 需求背景
从零搭建可直接运行的企业级 RBAC 权限管理系统，覆盖认证授权、用户/角色/权限/资源管理、审计日志、前后端分离与 Docker 化部署。

## 产品分析

### 目标用户与场景
- **用户群体:** 平台研发与运维人员
- **使用场景:** 内部系统权限管理、权限审计与合规要求
- **核心痛点:** 权限码分散、人工配置成本高、缺少统一审计

### 价值主张与成功指标
- **价值主张:** 提供标准化 RBAC 与权限码体系，支撑快速上线与维护
- **成功指标:** 开箱即用（默认账号可登录）、权限控制可验证、Swagger 可访问

### 人文关怀
遵循最小权限与隐私保护原则，避免在日志中记录敏感信息。

## 变更内容
1. 构建后端 NestJS RBAC 核心模块与认证授权体系
2. 构建前端 React 管理后台与权限码控制
3. 提供 Docker Compose 一键部署与初始化数据
4. 提供基础测试与 Swagger 文档

## 影响范围
- **模块:** Auth, Users, Roles, Permissions, Resources, Audit, Frontend, Docker
- **文件:** backend/*, frontend/*, docker-compose.yml, nginx/*
- **API:** /api/auth, /api/users, /api/roles, /api/permissions, /api/resources, /api/audit-logs
- **数据:** users, roles, permissions, resources, user_roles, role_permissions, audit_logs

## 核心场景

### Requirement: 认证与权限控制
**Module:** auth
支持登录、刷新、退出与权限校验，refreshToken 不可用于业务接口。

#### Scenario: 登录与刷新
用户登录后获取 accessToken 与 refreshToken，refreshToken 只能调用刷新接口并校验 tokenVersion。
- 返回用户 profile 与权限码

### Requirement: 用户/角色/权限管理
**Module:** users/roles/permissions
支持用户/角色/权限 CRUD 与绑定关系管理。

#### Scenario: 分配角色与权限
为用户分配多角色，为角色分配权限码，支持按钮级权限。
- 权限码唯一

### Requirement: 菜单与资源
**Module:** resources
后端返回菜单树与权限码，前端根据权限过滤菜单与按钮。

#### Scenario: 动态菜单
根据权限码生成菜单树与路由。
- 无权限则隐藏/禁用

### Requirement: 审计日志
**Module:** audit
记录登录与增删改操作。

#### Scenario: 操作审计
用户执行关键操作时记录审计日志。
- 不记录密码/Token

## 风险评估
- **风险:** 认证与权限边界处理不当导致越权
- **缓解:** 统一 Guard 校验权限码，refreshToken 严格限制使用场景
