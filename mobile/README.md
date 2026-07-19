# H5 Base Framework

基于 Vue 3 + Vite 的移动端 H5 多页应用（MPA）基础框架，也是当前仓库里的 C 端项目入口。

## 技术栈

- Vue 3.5 + Composition API
- Vite 5
- Vue Router 4
- Pinia
- Vue I18n
- Tailwind CSS 3 + mobile-first 规范
- BetterScroll 2.0
- Vant 4

## 现有应用

- `has-doc`：组件库文档与示例应用
- `has-web`：C 端业务入口，包含登录注册、首页、个人中心与接口对接骨架

## 目录结构

```
.
├── public/                     # 全局静态资源
├── src/
│   ├── components/             # 全局共享组件（按文件名自动注册）
│   ├── composables/            # Vue 组合式函数
│   ├── constants/              # 全局常量/枚举
│   ├── hooks/                  # 业务复用 hooks
│   ├── locales/                # 国际化资源
│   ├── utils/                  # 通用工具函数
│   └── packages/               # MPA 应用目录
│       ├── has-doc/            # 默认应用：组件库文档
│       └── <app>/              # 新增应用
│           ├── index.html      # 应用入口 HTML
│           ├── main.js         # 应用入口
│           ├── App.vue
│           ├── router/
│           ├── views/
│           ├── styles/
│           └── public/         # 应用级静态资源
├── dist/
│   └── <app>/                  # 各应用独立构建产物
├── .env.example
├── package.json
├── tailwind.config.js
└── vite.config.js
```

## 路径别名

| 别名 | 指向 |
|------|------|
| `@`  | 仓库根目录 `src/`（共享代码） |
| `@p` | 当前激活的 `src/packages/<app>/`（应用级代码） |

## 开发命令

```bash
# 启动默认应用（has-doc），端口默认 5173，被占用自动递增
npm run dev

# 启动指定应用
VITE_APP=has-doc npm run dev
PORT=5174 VITE_APP=has-doc npm run dev
npm run dev:has-web

# 构建指定应用，产物输出到 dist/<app>/
VITE_APP=has-doc npm run build
npm run build:has-web
```

同时启动多个应用时，建议分别为其指定不同 `PORT`：

```bash
PORT=5173 VITE_APP=has-doc npm run dev
PORT=5174 VITE_APP=other-app npm run dev
```

## 应用约定

- 每个应用独立入口、独立路由、独立构建产物
- `src/components` 下组件会自动全局注册，优先复用基础组件
- `src/packages/<app>/api/request.js` 统一封装请求，默认代理到 `/api`
- `src/packages/<app>/router/index.js` 使用 hash 模式，避免多入口部署时的 base 路径冲突

## 新增应用

1. 在 `src/packages/` 下创建 `<app>/` 目录。
2. 添加 `index.html`、`main.js`、`App.vue` 等入口文件。
3. 应用级 `index.html` 中 favicon、入口脚本请使用相对路径，例如 `./vite.svg`、`./main.js`。
4. 运行 `VITE_APP=<app> npm run dev` 即可独立开发。

## 当前可用页面

- `/`：组件库首页
- `/demo/button`：按钮示例
- `/demo/empty`：空状态示例
- `/demo/loading`：加载示例
- `/demo/modal`：弹窗示例
- `/demo/tag`：标签示例
- `/demo/image`：图片示例
- `/demo/card`：卡片示例
- `/demo/scroll`：滚动示例
- `/demo/self-form`：自研表单示例
- `/demo/drawer`：抽屉示例
- `/demo/swiper`：轮播示例
- `/demo/tabs`：标签页示例

`has-web` 当前可用页面：

- `/login`：手机号/邮箱验证码登录注册
- `/reset-password`：手机号/邮箱验证码重置密码
- `/home`：C 端首页
- `/profile`：个人中心

## 共享组件

所有 `.vue` 文件放在 `src/components/` 下，框架启动时会通过 `import.meta.glob` 自动 eager 加载，并按文件名注册为全局组件。组件名即文件名，例如 `BaseButton.vue` 注册为 `<BaseButton />`。

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改：

| 变量 | 说明 |
|------|------|
| `VITE_APP` | 当前要启动/构建的 MPA 应用目录名 |
| `PORT` | 开发服务器端口，不设置时默认 5173 |
| `VITE_API_BASE_URL` | API 基础地址 |

默认情况下，开发环境会把 `/api` 代理到 `http://localhost:3000`，用于对接后端 RBAC 服务。

## 构建产物

```bash
VITE_APP=has-doc npm run build
```

产物位于 `dist/has-doc/`，`index.html` 使用相对路径引用静态资源，可直接部署到任意路径。
