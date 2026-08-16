# shared 全局公共模块

本目录存放所有子应用（`src/packages/*`）共用的内容，通过 Vite 别名 `@shared` 引用，别名定义见根目录 `vite.config.js`：

```js
resolve: {
  alias: {
    '@shared': resolve(rootDir, 'src/shared'),
    '@': appDir // 当前应用目录（VITE_APP 指定）
  }
}
```

## 目录结构

```
src/shared/
├── components/    # 全局公共组件（Base* / Self* 前缀），入口应用统一全局注册
├── composables/   # 全局可复用的 Vue 组合式函数
├── constants/     # 全局常量 / 枚举配置
├── hooks/         # 与业务逻辑相关的复用 hooks（非 Vue 生命周期类）
├── locales/       # vue-i18n 多语言配置（zh-CN / en-US）
└── utils/         # 全局通用工具函数
```

## 各模块说明

### components 公共组件

统一放在 `components/` 下，通过 `import.meta.glob` 自动收集并注册为全局组件（见 [components/index.js](components/index.js)），入口应用 `main.js` 中引入一次即可：

```js
import GlobalComponents from '@shared/components'

app.use(GlobalComponents)
```

页面中直接使用标签，无需逐个 import：

```vue
<base-button type="primary" block>提交</base-button>
<base-empty description="暂无数据" />
```

命名约定：基础组件以 `Base` 前缀（如 `BaseButton`），自研复杂组件以 `Self` 前缀（如 `SelfForm`、SelfDrawer、SelfUpload）。

组件清单与 Props / Events / Slots 的详细文档见 [components/README.md](components/README.md)。

### composables 组合式函数

全局可复用的 Vue 组合式函数（与框架生命周期 / 响应式能力相关）。

```js
import { useXXX } from '@shared/composables'
```

### hooks 业务 hooks

与业务逻辑相关的复用 hooks（非 Vue 生命周期类），如请求封装、业务状态复用等。

```js
import { useXXX } from '@shared/hooks'
```

### constants 常量配置

全局常量与枚举，如状态映射、字典项、固定配置等。

```js
import { XXX } from '@shared/constants'
```

### locales 多语言

基于 vue-i18n，入口应用 `main.js` 中 `app.use(i18n)` 后即可使用 `$t` / `useI18n`。

```js
import i18n from '@shared/locales'

app.use(i18n)
```

语言文件：`zh-CN.json`（默认语言）、`en-US.json`。新增文案时两个文件需同步维护。

### utils 工具函数

全局通用工具函数（纯函数，不依赖 Vue 上下文），如格式化、校验、日期处理等。

```js
import { xxx } from '@shared/utils'
```

## 使用约定

1. **跨应用复用**：只有被多个子应用（`has-doc`、`has-web` 等）共用，或与具体业务无关的内容才放入 shared；单一应用私有的内容放在各自 `src/packages/<app>/` 下。
2. **命名规范**：
   - 组件：`Base*`（基础封装）/ `Self*`（自研复杂组件）
   - 组合式函数 / hooks：`use` 前缀驼峰命名
   - 常量：大写下划线（如 `ORDER_STATUS`）
3. **导出方式**：各目录统一从 `index.js` 具名导出，使用方只从目录入口导入，不直接引用内部文件路径（组件源码文件除外，如需按需引入单个组件文件时）。
4. **新增组件**：直接在 `components/` 下新建 `.vue` 文件即可被自动收集注册，无需修改注册代码；同时记得更新 [components/README.md](components/README.md) 的组件清单。
5. **不引入循环依赖**：shared 内模块保持独立，不得反向依赖 `src/packages/*` 下任何应用代码。
