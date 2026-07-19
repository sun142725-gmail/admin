# 设计方案

## 总体方案

在 `mobile/src/packages/` 下新增 `has-web` 应用，沿用现有 MPA 框架能力：

- 独立 `index.html`、`main.js`、`App.vue`
- 独立路由与页面
- 共用 `src/components`、`src/composables`、`src/utils`、`src/locales`
- 统一通过 `src/packages/has-web/api/request.js` 对接后端

## 页面结构

### 1. 登录注册

建议作为首屏入口，支持：

- 手机号 + 验证码登录/注册
- 邮箱 + 验证码注册/登录
- 手机号/邮箱验证码重置密码
- 账号密码兜底登录（如后续需要）

页面建议拆成：

- `LoginView`
- `RegisterView` 或登录页内切换模式
- `ResetPasswordView`

交互建议：

- 输入手机号/邮箱后先点发送验证码
- 验证码输入成功后直接进入业务首页
- 首次未注册时走自动注册逻辑

### 2. 首页

首页建议定位为业务导航页，不做纯营销页。

建议内容：

- 用户信息摘要
- 业务入口卡片或九宫格
- 常用功能快捷入口
- 消息/公告位（后续可扩）

首页数据建议从：

- `GET /api/auth/profile` 获取登录态与权限
- `GET /api/profile` 获取个人资料展示

### 3. 个人中心

建议包含：

- 头像
- 昵称
- 手机号/邮箱绑定信息
- 密码修改
- 退出登录

建议接口：

- `GET /api/profile`
- `PATCH /api/profile`
- `POST /api/profile/password`
- `POST /api/profile/avatar`

### 4. 头像上传

建议统一走公共上传接口：

- `POST /api/files/upload`

上传成功后再回写个人资料头像字段。

## 接口对接约定

### 鉴权

- `accessToken` 放请求头 `Authorization: Bearer <token>`
- `refreshToken` 单独保存
- accessToken 失效时自动刷新，刷新失败跳回登录页

### 请求封装

建议 `has-web` 独立封装一个 API 层：

- `api/request.js`：axios 实例
- `api/auth.js`：登录注册与刷新
- `api/profile.js`：个人资料
- `api/files.js`：文件上传

### 状态管理

建议 Pinia 至少拆两个 store：

- `authStore`：token、登录态、权限、用户摘要
- `profileStore`：个人资料、头像、绑定信息

## 文档同步策略

后续实现时，文档应该同步维护：

- `helloagents/wiki/mobile.md`：移动端总览
- `helloagents/wiki/c-end-integration.md`：对接说明
- `helloagents/wiki/api.md`：接口入口

## 风险与处理

- 验证码频控：要预留按钮倒计时和接口失败提示
- 登录态失效：要处理 refresh 失败回跳
- 头像上传：要限制类型、大小和路径前缀
- 多端共用账号：要避免把管理端权限直接暴露给 C 端首页

## ADR

推荐采用“`has-web` 新应用 + 统一后端账号域 + 独立 API 封装 + 独立状态管理”的方案。
