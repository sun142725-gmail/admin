# Frontend

## Purpose
前端页面与权限控制

## Module Overview
- **Responsibility:** 登录页、主布局、首页与面包屑、菜单图标与悬浮展开、头像入口、日志中心与公共表格、字典管理页面、PV/前端日志上报、用户/角色/权限页面与权限控制、角色功能权限独立配置页
- **Status:** ✅Stable
- **Last Updated:** 2026-03-13

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

### Requirement: 后台视觉一致性
**Module:** frontend
统一后台布局、内容容器、工具条、筛选区与列表页风格，降低页面视觉割裂。

#### Scenario: 固定布局
- Header 固定在顶部
- Sider 固定在左侧
- 主内容区独立滚动

#### Scenario: 页面结构统一
- 页面使用统一工具条标题与操作区
- 筛选区与表格区采用统一卡片层级
- 登录页与后台页采用不同但一致的视觉语言
- 页面级容器需避免重复边框包裹
- Header 与 Sider 交互需兼顾固定布局与过渡丝滑度
- 侧栏悬浮展开不得推动右侧内容区，优先使用覆盖式交互

#### Scenario: 角色权限独立配置
- 角色列表页仅保留权限概览，避免长权限标签撑爆表格
- 角色功能权限进入独立页面按模块分组配置
- 权限修改采用暂存后统一保存，降低误操作
- 独立权限页右侧提供模块导航浮窗，支持滚动高亮与点击锚定
- 模块导航与内容区均支持“全选当前模块”快捷操作
- 支持“仅看已选权限”筛选，便于快速复核当前角色已有权限
- 支持模块折叠/展开与全部收拢，降低权限数量增长后的阅读负担

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
- frontend-visual

## Change History
- [202601250851_rbac_system](../../history/2026-01/202601250851_rbac_system/) - 初始化前端模块
- [202601251534_log_center_enhance](../../history/2026-01/202601251534_log_center_enhance/) - 公共表格与日志中心增强
- [202601251636_log_menu_split](../../history/2026-01/202601251636_log_menu_split/) - 日志菜单拆分与路由调整
- [202601251700_dict_management](../../history/2026-01/202601251700_dict_management/) - 新增字典管理页面
- [202601251753_form_messages](../../history/2026-01/202601251753_form_messages/) - 表单提示文案统一
- [frontend-visual](../frontend-visual.md) - 后台视觉规范与布局统一约定
