# UI 规范化改造方案：Tailwind v4 引入 + antd5 主题 Token 化

> 日期：2026-09-23 · 原则：**只动样式，不动业务逻辑**（不改 handler/state/api/redux/路由）

## 一、现状问题

1. **antd 视觉靠 `!important` 硬覆写**：`global.css`（861 行）中 `.ant-card/.ant-btn/.ant-input/.ant-table/.ant-modal` 等全局 `!important` 覆写，违反 antd5 规范（应走 ConfigProvider theme token）
2. **ConfigProvider 无 theme 配置**：主色/圆角/字体全是 antd 默认值 + CSS 硬补
3. **无 Tailwind**：布局/间距/圆角/阴影全手写，无统一工具类体系
4. **CSS 变量已有一套 token**（`--brand-primary: #1677ff` 等）但只覆盖部分场景

## 二、方案（三层，从底向上）

### A 层 · Tailwind v4 基建（新依赖：tailwindcss + @tailwindcss/vite，devDeps）
- vite.config.ts 注册 `tailwindcss()` 插件
- global.css 顶部**只引入 theme + utilities 两层，跳过 preflight**（preflight 会 reset button/border 等元素样式，破坏 antd 视觉，必须跳过）：
  ```css
  @layer theme, base, components, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
  ```
- `@theme` 定义设计 token（值对齐现有 CSS 变量，视觉零变化）：
  - `--color-primary: #1677ff`、`--color-text-main: #1a1a1a`、`--color-text-sub: #737373`
  - `--color-surface: #ffffff`、`--color-canvas: #f5f5f5`、`--color-line: #ebebeb`
  - `--radius-btn: 12px`、`--radius-card: 20px`
- 层级说明：utilities 在 `layer(utilities)` 内，优先级低于未分层的 antd 样式 → 工具类**不会**意外覆盖 antd 内部样式（正是想要的边界）

### B 层 · antd 主题 Token 化（消灭 !important 覆写）
ConfigProvider 增加 `theme`（token/components），值与被删除的 CSS 覆写逐项对齐：

| 原 CSS 覆写 | 迁移为 token |
|---|---|
| `.ant-btn` 圆角 12 / `.ant-input` 等圆角 12 | `token.borderRadius: 12` |
| `.ant-card` 圆角 20 / 边框色 | `components.Card.borderRadiusLG: 20` + colorBorderSecondary |
| `.ant-btn-primary` 阴影 | `token.boxShadowPrimary: '0 10px 18px rgba(22,119,255,.2)'` |
| `.ant-table` 圆角 18 / 头部 `#f7faff` / hover 行背景 | `components.Table`: borderRadiusLG 18 / headerBg #f7faff / rowHoverBg |
| `.ant-modal` 圆角 24 | `components.Modal.borderRadiusLG: 24` |
| `--brand-primary` 主色 | `token.colorPrimary: '#1677ff'` |
| 字体栈 | `token.fontFamily` |

### C 层 · 通用布局类 Tailwind 化（JSX 零改动）
- **保留 JSX 原有 className**，把 global.css 中结构简单的通用类改为 `@apply` 工具类实现（值不变）：`page-toolbar`、`page-toolbar-title/subtitle`、`page-actions`、`page-filter-card`、`page-table-card`、`app-breadcrumb`、`app-content-inner`、`app-page-panel`
- **保留原生 CSS 不动**：复杂视觉类（login-* 渐变背景、role-permissions-* 网格交互、app-sider/menu 的 mask/动画）——Tailwind 用于布局/间距类，复杂特效保留原生 CSS 是合理的规范边界
- `divination.css`（C 端占卜页，914 行）**完全不动**

## 三、明确不做（防改坏）

- ❌ 不做 SelfForm/SelfTable/SelfModal 组件封装重构（会触碰业务逻辑，列入 backlog 另行立项）
- ❌ 不改任何 handler/state/api/redux/路由
- ❌ 不清理页面内联 style（Publish/Home/Chat/Template 约 54 处，列入 backlog 分批做）
- ❌ 不动 divination 页视觉

## 执行状态（2026-09-23）

- ✅ A 层：tailwindcss@4.3.3 + @tailwindcss/vite 已装（devDeps）；vite.config 改名 .mts（@tailwindcss/vite 为 ESM-only）；preflight 产物 0 注入已验证
- ✅ B 层：App.tsx theme token/components 迁移完成；global.css 删除全部 antd 全局 !important（app-page-flat 页面级覆写、drawer 顶部单侧圆角保留——token 无法表达）；LoginPage 卡片圆角/阴影改 style prop
- ✅ C 层：page-toolbar/title/subtitle/actions/app-breadcrumb/app-content-inner/role-permissions 居中类 @apply 化，产物值逐项对齐验证
- 📋 后续批次（未做，按方案三）：SelfForm/SelfTable 封装、页面内联 style 清理（Publish 18/Home 13/Chat 13/Template 10）、非标准间距刻度规范化（14/18px）

## 四、验证与回滚

- 每阶段 `npx tsc --noEmit` + `npm run build`；构建产物抽查确认 preflight 未注入
- token 值逐项与原 CSS 值对照（上表），保证视觉对齐
- 关键页面人工核对清单：登录页、MainLayout（侧栏/头部）、Users/Roles/Dict 通用列表页、RolePermissions 复杂页、AI Chat
- git 分阶段提交，任一阶段可独立回滚
