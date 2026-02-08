# 企业级 RBAC 权限管理系统

> 本文件包含项目级核心信息，模块细节见 `modules/` 目录。

---

## 1. 项目概述

### 目标与背景
构建可直接运行的企业级 RBAC 系统，支持多角色与按钮级权限，并提供完整前后端、文档、初始化数据与基础测试。

### 范围
- **包含范围:** 认证授权、用户/角色/权限/资源管理、审计日志、Swagger、Docker 部署
- **不包含:** 多租户、复杂审批流、第三方 SSO

### 相关角色
- **Owner:** 平台研发团队

---

## 2. 模块索引

| 模块名称 | 职责 | 状态 | 文档 |
|---------|------|------|------|
| Auth | 登录、刷新、权限校验 | ✅Stable | [auth](modules/auth.md) |
| Users | 用户管理与角色分配 | ✅Stable | [users](modules/users.md) |
| Roles | 角色管理与权限分配 | ✅Stable | [roles](modules/roles.md) |
| Permissions | 权限码管理 | ✅Stable | [permissions](modules/permissions.md) |
| Resources | 菜单/资源管理 | ✅Stable | [resources](modules/resources.md) |
| Audit | 审计日志 | ✅Stable | [audit](modules/audit.md) |
| Frontend | 前端页面与权限控制 | ✅Stable | [frontend](modules/frontend.md) |
| Divination | 六爻占卜 | ✅Stable | [divination](modules/divination.md) |
| AI | AI 解卦 | ✅Stable | [ai](modules/ai.md) |
| AuditCenter | 日志中心 | ✅Stable | [audit-center](modules/audit-center.md) |
| LogCenter | 打点/前端/错误日志中心 | ✅Stable | [log-center](modules/log-center.md) |
| Profile | 个人中心 | ✅Stable | [profile](modules/profile.md) |
| Dict | 字典管理 | ✅Stable | [dict](modules/dict.md) |
| Notification | 通知管理（模板/发布记录） | 🚧In Development | [notification](modules/notification.md) |

---

## 3. 快速链接
- [技术规范](../project.md)
- [架构设计](arch.md)
- [API 文档](api.md)
- [数据模型](data.md)
- [变更历史](../history/index.md)
