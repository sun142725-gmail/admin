# Frontend

## Purpose
前端页面与权限控制

## Module Overview
- **Responsibility:** 登录页、主布局、首页与面包屑、菜单图标与悬浮展开、头像入口、日志中心与公共表格、字典管理页面、PV/前端日志上报、用户/角色/权限页面与权限控制
- **Status:** ✅Stable
- **Last Updated:** 2026-01-25

## Specifications

### Requirement: 页面与权限
**Module:** frontend
根据权限码控制菜单与按钮显示，并实现 token 自动刷新。

#### Scenario: 菜单过滤
- 后端返回菜单树
- 前端根据权限码过滤

#### Scenario: 401 自动刷新
- accessToken 过期自动刷新
- 刷新失败跳转登录

## API Interfaces
### GET /api/resources/tree
**Description:** 拉取菜单树
**Input:** 无
**Output:** 菜单树结构

## Data Models
- 无

## Dependencies
- auth
- resources

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化前端模块
- [202601251534_log_center_enhance](../../history/2026-01/202601251534_log_center_enhance/) - 公共表格与日志中心增强
- [202601251636_log_menu_split](../../history/2026-01/202601251636_log_menu_split/) - 日志菜单拆分与路由调整
- [202601251700_dict_management](../../history/2026-01/202601251700_dict_management/) - 新增字典管理页面
- [202601251753_form_messages](../../history/2026-01/202601251753_form_messages/) - 表单提示文案统一
