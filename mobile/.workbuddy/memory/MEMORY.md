# 项目长期记忆 - has-web 家庭管理应用

## 技术栈
Vue 3 + Vant 4 + Pinia + TailwindCSS + Vite
- 路由：vue-router hash 模式
- HTTP：axios，baseURL=/api，自动 token 注入 + 401 刷新
- 构建：`VITE_APP=has-web npx vite build`，dev: `VITE_APP=has-web npx vite`

## Tailwind 限制（重要）
- spacing 只定义了 0/2/4/6/8/10/12/16/20/24/28/32，14/18 等需要用任意值 `[14px]`
- borderRadius 只有 sm/md/lg/xl/full，没有 2xl
- colors 完全覆盖了默认调色板，导致 border-transparent、text-gray-400 等需在 extend 中补充或用内联样式

## UI 设计规范
- 主色渐变：#0ea5e9 → #0284c7（primary-500 → primary-600）
- 卡片：白色圆角 rounded-xl + shadow-card
- auth 页面专用样式类前缀：.auth-
- 首页样式类前缀：.home-（或 .fam-）
- 个人中心样式类前缀：.profile-
- 大事纪样式类前缀：.ms-
- 碑文汇总页样式类前缀：.stele-

## 关键文件位置
- 开发文档：docs/DEVELOPMENT.md
- 接口规范：docs/API_SPEC.md
- 大事纪前端文档：docs/MILESTONE_DEV.md
- 大事纪后端文档：docs/MILESTONE_API.md
- API 层：src/packages/has-web/services/
- Store 层：src/packages/has-web/stores/
- 页面：src/packages/has-web/views/
- 组件：src/packages/has-web/components/
- 公共组件：src/shared/components/（含 SelfUpload.vue 图片上传）
- 文件上传接口：services/files.js → POST /api/files/upload
- 工具：src/packages/has-web/utils/validators.js
- Composable：src/packages/has-web/composables/useCountdown.js
- 样式：src/packages/has-web/styles/index.css

## 接口约定
- 统一响应：{ code, message, data }
- 认证：Authorization: Bearer <accessToken>
- 密码登录：POST /api/auth/login { account, password }
- 验证码登录：POST /api/auth/code/login { channel, target, code }
- 发送验证码：POST /api/auth/code/send { channel, scene, target }
- 注册：POST /api/auth/register { channel, target, code, password }
- 家庭接口前缀：/api/family
- 待办接口前缀：/api/family/:familyId/todos
- 公告接口前缀：/api/family/:familyId/announcements
- 大事纪接口前缀：/api/family/:familyId/milestones
- 大事纪权限：个人事件仅创建人可编辑/删除/切换核心；家庭事件创建人+房主可编辑/删除，核心标记仅房主
