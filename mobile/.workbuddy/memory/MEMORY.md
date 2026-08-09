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

## shared/components 目录 Vant 组件使用规则（重要）

**实测结论：Vant 4 RadioGroup 通过 `useChildren(RADIO_KEY)` + Radio `useParent(RADIO_KEY)` 基于 provide/inject 通信。在 shared/ 目录下的封装组件内使用 `van-radio-group` + `van-radio` 时，render 函数编译产物中 Radio 子节点未正确建立 provide/inject 链路，导致 radio 子项不渲染（但模板有占位，HTML 看不到）。**

**最终方案：BaseRadio 不依赖 Vant Radio 组件，纯 HTML + CSS 实现**。这样既绕开 Vant 通信链路问题，也避免了 shared/ 目录与 VantResolver 的兼容性陷阱。

```vue
<!-- shared/components/BaseRadio.vue -->
<template>
  <label class="base-radio__item">
    <span class="base-radio__circle">
      <span v-if="checked" class="base-radio__dot"></span>
    </span>
    <input type="radio" :value="opt.value" :checked="model === opt.value"
           :disabled="disabled" @change="model = opt.value" />
    <span class="base-radio__label">{{ opt.label }}</span>
  </label>
</template>
```

Props：`modelValue` / `options`（简单数组或对象数组）/ `direction`（horizontal/vertical）/ `disabled` / `theme`（primary/warning/success/danger）。

应用目录（`src/packages/*/components/`）下的组件仍可继续用 Vant 组件的 kebab-case 标签，VantResolver 会处理 JS + CSS 自动导入。

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
