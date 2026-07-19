# Mobile H5

## Purpose
C 端移动端 H5 基础框架

## Module Overview
- **Responsibility:** 承载 C 端 H5 页面、多页入口、基础组件库与移动端样式规范
- **Status:** 🚧In Development
- **Last Updated:** 2026-07-19

## Specifications

### Requirement: C 端 H5 框架
**Module:** mobile
提供移动端多页框架、公共组件、国际化与 API 请求封装。

#### Scenario: 独立应用
- 每个业务应用独立入口、独立路由、独立构建产物
- 通过 `VITE_APP` 选择当前应用

#### Scenario: 组件复用
- `src/components` 下组件自动全局注册
- 页面直接使用 `<base-button />` 等标签

#### Scenario: 后端对接
- 请求统一走 `VITE_API_BASE_URL`，默认 `/api`
- 开发环境代理后端 `localhost:3000`

#### Scenario: has-web 业务入口
- 新增 `mobile/src/packages/has-web`
- 覆盖登录注册、首页、个人中心
- 独立封装 `auth/profile/files` API 与 `auth/profile` store

## API Interfaces
- `src/packages/has-web/api/auth.js`：验证码登录、发送验证码、重置密码、刷新、退出
- `src/packages/has-web/api/profile.js`：个人资料查询与更新
- `src/packages/has-web/api/files.js`：公共文件上传

## Data Models
- 无

## Dependencies
- vue
- vue-router
- pinia
- vue-i18n
- vant
- better-scroll

## Change History
- [202607191215_mobile_has_web](../../history/2026-07/202607191215_mobile_has_web/) - 新增 has-web 登录注册、首页、个人中心与接口对接骨架
- [202607191152_mobile_docs](../../history/2026-07/202607191152_mobile_docs/) - 补充移动端 H5 框架说明
