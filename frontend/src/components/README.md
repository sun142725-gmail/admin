# 前端组件库基座（base / business / hooks / types）

React 18 + antd 5 + TS 严格模式下的可复用基座。分层职责：

| 层 | 目录 | 职责 | 规则 |
| --- | --- | --- | --- |
| base | `src/components/base/` | antd 纯封装（SelfTable/SelfForm/SelfModal/SelfDrawer） | 不含业务语义；默认值=现状语义，外部 props 优先 |
| business | `src/components/business/` | 业务复合件（PageHeader/PagePanel/FilterBar/StatusTag/ActionCell/ConfirmAction/StatCard/MediaPreview） | 组合 base 层与既有原语（Permission/JsonView/ColumnSettings） |
| hooks | `src/hooks/` | 复用逻辑（useApiMessage/useTableQuery/useFormModal/useColumnSettings） | 纯逻辑，不渲染 |
| types | `src/types/` | 公共类型与档位常量（PageResult/StatusMeta/三张刻度表） | types/ui.ts 仅类型+字面量，node 可直测 |
| utils | `src/utils/errorMessage.ts` | getErrorMessage 纯函数 | 统一错误文案口径 |

演示页：`/dev/components`（不进侧边菜单的内部演示页，登录守卫保护、本地 mock 零接口调用）→ `src/pages/dev/ComponentPlayground.tsx`。

## 迁移总则（每组统一执行）

1. 替换顺序：先壳后芯 —— PageHeader → FilterBar → PagePanel+SelfTable → SelfModal/SelfDrawer+useFormModal → useApiMessage → StatusTag/ActionCell/ConfirmAction → Space 档位与内联样式收敛。
2. import 改 base/business 分层路径；`scripts/check-imports.mjs` 兜底相对路径存在性。
3. 每组提交前：`npm run check` + vitest + 375/1440 双视口手工抽测。
4. message 文案与接口调用逐 diff 核对，行为零改动。
5. 预期视觉变更逐站记录到本文「预期视觉变更清单」。

---

## base 层

### SelfTable（`base/SelfTable.tsx`）

原 `components/AppTable.tsx` 收编升级：默认分页/scroll/size 逻辑逐字迁移，补泛型 `<T extends object>`。`AppTable.tsx` 已改为一行 re-export 垫片，14 页引用零改动；stock 波全仓 grep `AppTable` 零引用后删垫片。

- 默认分页合并语义 `{defaults, ...props.pagination}`：外部字段覆盖默认（受控 `current/pageSize/total/onChange` 全量透传）；`pagination={false}` 保持关闭。
- 默认：`showSizeChanger:true`、`pageSizeOptions:['10','20','30','50']`、`showTotal: 共 N 条`、分页 locale `items_per_page:'页'`、`size:'middle'`、`scroll={x:'max-content'}`。
- `onRow`、`locale.emptyText` 等 TableProps 全量透传（表格空态一律走这里，不用 EmptyState，两者不得叠加）。

```tsx
// 替换前
import { AppTable } from '../../components/AppTable';
// 替换后（存量可暂不替换，垫片等价；新代码一律 SelfTable）
import { SelfTable } from '../../components/base/SelfTable';
```

⚠ **条件分页特例**（stock 三页 `pagination={cond ? { pageSize:50, pageSizeOptions } : false}`）：不传 `showSizeChanger` 即保持原生行为——rc-pagination 默认 `total>50` 才显示切换器，与迁移前现状一致（原生 Table 并非没有 showSizeChanger，勿再显式写 `showSizeChanger:false`）；`pageSizeOptions:['10','20','50','100']` 显式对齐 rc-pagination 原生默认档位。

### SelfForm（`base/SelfForm.tsx`）

`layout='vertical'` 默认（可覆盖），FormProps 全量透传。

```tsx
// 替换前（UsersPage.tsx:65-71 样板）
let values;
try { values = await form.validateFields(); } catch { return; }
// 替换后
const values = await validateFormValues(form);
if (!values) return;
```

### SelfModal（`base/SelfModal.tsx`）

- 默认 `className='app-form-modal'`（global.css:675 内边距 18px 20px），外部 className 追加不覆盖。
- `okText/cancelText` 默认「确定/取消」= zh_CN locale（视觉零变化），外部透传优先。
- 宽度档位：`width="sm"=520`（默认）/`"md"`=640/`"lg"`=720；number|string 透传。`resolveModalWidth` 纯函数可测。
- `footer={null}` 详情态；confirmLoading 透传。
- **不设** destroyOnHidden/forceRender：保「reset→setFieldsValue→open」受控时序（基座不接管重置，由 useFormModal 承载）。

```tsx
// 替换前
<Modal className="app-form-modal" title={t} open={open} onOk={onOk} onCancel={close}>
// 替换后
<SelfModal title={t} open={open} onOk={onOk} onCancel={close}>   // width 缺省 520
```

### SelfDrawer（`base/SelfDrawer.tsx`）

- 默认 `className='app-form-drawer'`（global.css:679,683）、`width="md"`=560（贴现状最大簇）、`styles.wrapper.maxWidth:'80vw'`（antd5 规范小屏兜底；必须落在宽度载体 `.ant-drawer-content-wrapper` 即 styles.wrapper，落在 style 会作用到 content 导致面板不贴边露空隙）。
- 宽度刻度 **sm=480 / md=560 / lg=720**；number|string 透传保留（`'66vw'` 响应式合法特例，二期归档；`min(92vw,360px)` 经实测已不存在于当前代码）。`resolveDrawerWidth` 纯函数可测。
- extra 操作区、受控 open 全量透传。

```tsx
// 替换前
<Drawer className="app-form-drawer" width={560} open={open} onClose={close} title={t}>
// 替换后（width=560 即 md 档默认，可省略）
<SelfDrawer open={open} onClose={close} title={t}>
```

---

## business 层

### PageHeader（`business/PageHeader.tsx`）

`title/subtitle/actions` 插槽 → page-toolbar / page-toolbar-title / page-toolbar-subtitle / page-actions 类（global.css:393-407），与 UsersPage.tsx:202-214 结构等价。

```tsx
// 替换前
<div className="page-toolbar">
  <div>
    <div className="page-toolbar-title">用户管理</div>
    <div className="page-toolbar-subtitle">维护后台用户…</div>
  </div>
  <div className="page-actions">{/* 按钮 */}</div>
</div>
// 替换后
<PageHeader title="用户管理" subtitle="维护后台用户…" actions={<Button type="primary">新增用户</Button>} />
```

收编 5 种并存写法：page-toolbar 类（7 文件）、flow-page-header 自绘 flex（FlowRunsPage.tsx:246、FlowsPage.tsx:139，迁移时比对视觉等价）、Card title+extra、裸 Typography.Title、无标题裸表格。LoginPage 独立布局不套用。

### PagePanel / EmptyState（`business/PagePanel.tsx`）

`PagePanel` = page-table-card（global.css:422）div 包裹。
`EmptyState` 仅服务**非表格空态**（详情/页面级，如 AuditCenterPage「该 TraceId 暂无日志」、GraphicPage「还没有图文故事」），`description` 必须开放透传，默认「暂无数据」仅用于无定制文案处；**表格空态一律走 SelfTable 的 locale.emptyText，两者不得叠加**。

```tsx
// 替换前
<div className="page-table-card"><AppTable …/></div>
<Empty description="还没有图文故事" />
// 替换后
<PagePanel><SelfTable …/></PagePanel>
<EmptyState description="还没有图文故事" />
```

### FilterBar（`business/FilterBar.tsx`）

page-filter-card（global.css:409）+ Form layout='inline' + 查询/重置默认按钮组（DictPage.tsx:280-294 结构等价）。

- `hideDefaultActions` + `formClassName`：audit 特例（AuditCenterPage.tsx:910 Form className='flex flex-wrap gap-4'，:956-989 查询/重置/刷新/自动刷新/导出CSV/ColumnSettings 同处一个全宽居中 Form.Item），不支持即迁移即变布局。
- `actions` 插槽承载刷新/导出/列设置等。
- 故意不设 Form onFinish：现状查询由按钮触发，避免新增「回车提交」行为。

```tsx
// 替换前
<div className="page-filter-card">
  <Form layout="inline" form={form}>
    {/* Form.Item… */}
    <Form.Item><Space><Button type="primary" onClick={onSearch}>查询</Button><Button onClick={onReset}>重置</Button></Space></Form.Item>
  </Form>
</div>
// 替换后
<FilterBar form={form} onSearch={onSearch} onReset={onReset}>{/* Form.Item… */}</FilterBar>
```

### StatusTag（`business/StatusTag.tsx`）

`<StatusTag value map fallback?>` + `resolveStatusMeta` 纯函数。map 未命中走 fallback；无 fallback 退化为原值无色 Tag（FlowRunsPage.tsx:294-295 现状语义）。

```tsx
// 替换前
const RUN_STATUS_META = { running: { label: '运行中', color: 'processing' }, … };
<Tag color={RUN_STATUS_META[v]?.color}>{RUN_STATUS_META[v]?.label ?? v}</Tag>
// 替换后
<StatusTag value={v} map={RUN_STATUS_META} />
```

收编清单：flowRunUI 3 张 + GraphicPage 2 张 + AuditCenterPage LEVEL_COLOR + stock ScreenerRunsPanel RUN_STATUS。**TemplatePage SOURCE_COLOR_MAP 保留页内私有**（`{color,bgColor}` 双色结构 StatusMeta 无法承载）。色板走 antd 预设词；同语义异色按 README「状态色刻度表」逐组执行。

### ActionCell（`business/ActionCell.tsx`）

`items={key,label,onClick,danger?,permission?}`；组合既有 Permission 组件（mode=disable 语义不变）。**默认 `type='link' size='small'`**（终结 default vs link 分裂，预期视觉统一），`variant='default'` 兜底。

```tsx
// 替换前
<Permission code="system:user:update" mode="disable"><Button size="small" onClick={…}>编辑</Button></Permission>
// 替换后（列 render 内）
<ActionCell record={item} items={[{ key: 'edit', label: '编辑', permission: 'system:user:update', onClick: onEdit }]} />
```

### ConfirmAction（`business/ConfirmAction.tsx`）

- `<ConfirmPopconfirm title onConfirm>`：收编 15 处 Popconfirm。**okText 不设默认**（透传 zh_CN locale「确定」）；仅 FlowsPage.tsx:256、NovelVideoPage.tsx:430 现状显式 '删除'，迁移时传参保留。
- `confirmAction(options)`：收编 4 文件 Modal.confirm（UsersPage.tsx:89-103 样板）；`buildConfirmOptions` 纯函数（danger:true → okButtonProps.danger）。
- DictPage.tsx:109,188 无确认直删保持现状，只统一形态。

```tsx
// 替换前
<Popconfirm title="确认删除？" onConfirm={del}><Button danger>删除</Button></Popconfirm>
Modal.confirm({ title: '删除用户', content: '…', okButtonProps: { danger: true }, onOk });
// 替换后
<ConfirmPopconfirm title="确认删除？" onConfirm={del}><Button danger>删除</Button></ConfirmPopconfirm>
confirmAction({ title: '删除用户', content: '…', danger: true, onOk });
```

### StatCard（`business/StatCard.tsx`）

antd Statistic 版归一。`title/value/suffix/precision/prefix/loading/tip/children/extra`；`children` 承载 Progress 纵排（HomePage.tsx:120-135 现状），`extra` 走 Card extra 位。

```tsx
// 替换前
<Card bordered={false}><Statistic title="CPU 使用率" value={v} suffix="%" precision={2} /><Progress className="mt-3" percent={v} showInfo={false} /></Card>
// 替换后
<StatCard title="CPU 使用率" value={v} suffix="%" precision={2}><Progress className="mt-3" percent={v} showInfo={false} /></StatCard>
```

### MediaPreview（`business/MediaPreview.tsx`）

- `classifyMedia(url)`：扩展名分流 video/image/audio（flowRunUI.tsx:44-46 原口径）。
- `MediaPreview`：单 URL 渲染（video 100%/maxHeight 420、img/audio 280 宽，GraphicPage 现状尺寸）。
- `OutputsMediaPreview`：outputs 键值分流——媒体直渲 + 其余收进 Collapse+JsonView 折叠（RunOutputsView 升级版，原为裸 pre 直出，属预期视觉变更）。
- 仅 antd+原生标签，禁碰 react-quill/@xyflow/react/echarts 懒加载边界。

---

## hooks

### useApiMessage（`hooks/useApiMessage.ts`）

`success/error/errorFrom/warning/info/loading`。内部仍用 antd 静态 message（挂载点与现状一致）；`errorFrom(error, fallback?)` 收编 `error instanceof Error && error.message ? … : '兜底'` 样板（43 处）与两份私有 getErrorMessage 副本。**文案与分支逐字保持**，notification.* 全仓 0 处无需封装。

```tsx
// 替换前
message.error(error instanceof Error && error.message ? error.message : '操作失败');
// 替换后
const msg = useApiMessage();
msg.errorFrom(error, '操作失败');   // fallback 缺省「操作失败」
```

### useTableQuery（`hooks/useTableQuery.ts`）

`{fetcher, defaultPageSize?=20, defaultFilters?, onError?}` → `{data,total,page,pageSize,filters,loading,reload,search,reset,setPage,pagination}`。fetcher 走 ref（页面无需 useCallback 也不引发 effect 重跑）；`search()` 自动回第 1 页；`pagination` 即 SelfTable 直用 props。`buildPagination` 纯函数可测。

```tsx
// 替换前（DictPage.tsx:36-78 手写样板 ~40 行）
// 替换后
const table = useTableQuery<DictItem, { keyword?: string }>({ fetcher: listDicts });
<PagePanel><SelfTable … pagination={table.pagination} /></PagePanel>
```

### useFormModal（`hooks/useFormModal.ts`）

`useFormModal(form, {reset?=true})` → `{open, editing, openForm, close, setOpen}`（options 仅含 reset，form 为第一位置参数）。`openForm(record?)` 统一「reset→setFieldsValue→open」（UsersPage.tsx:51-63 两分支合一）。

⚠ **DictPage 特例**：onEdit（:86-90）与 openItemModal（:122-134）现状无 resetFields → 迁移时显式传 `reset:false` 保持现状，「补 reset」单列为后续可选行为修复。

```tsx
// 替换前
const onCreate = () => { setEditItem(null); form.resetFields(); setOpen(true); };
const onEdit = (item) => { setEditItem(item); form.resetFields(); form.setFieldsValue(item); setOpen(true); };
// 替换后
const modal = useFormModal<UserItem>(form);
modal.openForm();        // 新建
modal.openForm(item);    // 编辑
```

### useColumnSettings（`hooks/useColumnSettings.ts`）

`{tab, defaults, store?}` → `{visible, change, reset, storageKey}`。**契约不得变**：前缀 `rbac_log_columns_`、值=列 key 数组 JSON、`change(null)` → removeItem 回默认（AuditCenterPage.tsx:541-557）。store 注入式（默认浏览器 localStorage；node 单测注入内存实现）；配套 `components/ColumnSettings.tsx` 原样复用。

```tsx
// 替换前（AuditCenterPage visibleMap 手写 ~25 行）
// 替换后
const cols = useColumnSettings({ tab: activeTab, defaults: DEFAULT_VISIBLE[activeTab] });
<ColumnSettings options={options} visible={cols.visible} onChange={cols.change} onReset={cols.reset} />
```

---

## 刻度表

### ① Space 间距四档（`types/ui.ts SPACE_SIZE`，与 App.tsx token margin* 同源）

| 档位 | 值 | 用途 |
| --- | --- | --- |
| xs | 4 | 标签/按钮组内 |
| sm | 8 | Space 默认档 |
| md | 12 | 表单项间 |
| lg | 16 | 卡片内边距 |

现状 0/2/4/6/8/12/16/large 八种散值归一；`<Space size={SPACE_SIZE.md}>`。

### ② 弹层宽度刻度

| 组件 | sm | md（默认） | lg | 透传 |
| --- | --- | --- | --- | --- |
| SelfModal | 520 | 640 | 720 | number|string |
| SelfDrawer | 480 | 560 | 720 | number|string（'66vw'/min() 合法）+ styles.wrapper.maxWidth 80vw |

现状散值归档映射：Drawer 480→sm、560→md、640/680→md 或 lg（就近）、720→lg、760→专项截图比对后收敛、860(PublishPage) 与 900(KlineDrawer) 保持数字透传（嵌套内容/自绘图表未验证收窄，评审回退原值）、'66vw'→透传保留（已知特例二期归档）。

### ③ 状态色刻度（语义映射表，迁移逐组执行）

| 语义 | 色值（antd 预设词） | 现状锚点 |
| --- | --- | --- |
| 成功/启用 | success / green | UsersPage.tsx:156 启用=green |
| 运行中 | processing | flowRunUI RUN_STATUS |
| 失败 | error / red | flowRunUI / AuditCenter LEVEL_COLOR |
| 警告/取消 | warning | flowRunUI cancelled |
| 中性/默认 | default | 停用（UsersPage 禁用=无色 Tag） |

同语义异色（如「停用」红 vs 无色）统一到本表：**启用=green、禁用=default（无色）**，对齐 UsersPage.tsx:156。stock 语义色走 global.css:16-18 `--color-stock-up/down` 工具类（text-stock-up/down）；KlineChart echarts 内部 hex 为 plan/ui-standardization-20261025.md:51 认定的合理例外保留。

---

## 预期视觉变更清单（迁移逐站记录）

| 变更 | 触发条件 | 影响站点（随各组迁移补充） |
| --- | --- | --- |
| app-form-modal 新增站点 | 无 className 弹窗迁入 SelfModal 获 18px 20px 内边距 | 如 stock/WatchlistPage.tsx:354-361（无 className 且 okText='保存'）等，逐站枚举 |
| ActionCell link 统一 | default size=small 操作列（UsersPage.tsx:169-191）迁入后变 link | admin 组各页操作列 |
| Tag 语义色统一 | 同语义异色收敛到色刻度表（停用=红→无色等） | 逐组比对 |
| Drawer 中间值归档 | 640/680/760 → sm/md/lg | PublishPage 860 保持数字透传（嵌套内容未验证收窄）、KlineDrawer 900 保持数字透传（KlineChart 自绘图表未验证收窄） |
| SelfDrawer maxWidth 80vw | 视口 <700px 时抽屉收窄且贴屏幕右缘（styles.wrapper 兜底，规范要求的响应式） | 全部迁入站点小屏 |
| OutputsMediaPreview JSON 折叠 | 原 RunOutputsView 裸 pre → Collapse+JsonView | flow 组迁移时截图比对 |
| FilterBar 控件宽 140/120 硬编码改响应式 | audit 筛选栏（AuditCenterPage.tsx:912,931,945,969） | audit 组 |
| stock 条件分页补默认值 | 已按 rc-pagination `total>50` 原生默认处理（不传 showSizeChanger，显式 pageSizeOptions 对齐档位） | 不列入 |

## 红线（各组迁移必读）

1. **行为零改动最高优先**：接口调用、redux、路由参数、响应数据处理完全保留。
2. RolePermissionsPage `.app-content-inner` 滚动锚点类名禁变（布局红线）。
3. global.css 的 Sider/断点/布局类规则禁触（plan 文档 22-26 行踩坑）；`app-page-flat` 既有 `!important` 作用域规则原样保留。
4. TemplatePage ReactQuill blot 注册与 open effect 回填时序（TemplatePage.tsx:130-149）绝对不动。
5. ChatPage 高度公式与 `--header-height:56px` 耦合，换壳不动公式，375/768 回归。
6. flow：@xyflow/react 画布区与节点交互零触碰。
7. stock：onRow 点击开 K 线抽屉与 isStockRowClickIgnored 判断必须保留（ScreenerPage.tsx:436-443）。
8. 组件库文件禁同步 import react-quill/@xyflow/react/echarts（懒加载边界）。
9. divination Coin/YaoStack `key=index` 与翻转动画 delay 耦合（CastPanel.tsx:51），保留并注释，不纳入 key 整改。

## 逐组迁移 checklist

- [ ] **admin（基准模板波）**：Users/Roles/Permissions/Dict/Profile → PageHeader/FilterBar/PagePanel+SelfTable/SelfModal+useFormModal/confirmAction/StatusTag/ActionCell；RolePermissionsPage 禁改 `.app-content-inner`；HomePage StatCard+children；LoginPage 仅收 useApiMessage。
- [ ] **content**：TemplatePage（Quill 时序不动、SOURCE_COLOR_MAP 保留）、PublishPage 抽屉 860 保持数字透传（嵌套内容未验证收窄，不收敛）、Inbox/Publish 用 useTableQuery、AgentsPage 560=md 零变更、ChatPage 375/768 回归。
- [ ] **audit**：useColumnSettings（契约）、FilterBar hideDefaultActions+formClassName、`Record<string,any>` 补类型、OverviewPanel #cf1322→token 工具类、:1078 EmptyState description。
- [ ] **flow**：FlowRunsPage 288=560 零变更、FlowEditorPage 930=460 截图确认、flowRunUI 3 表收编 StatusTag、RunOutputsView→OutputsMediaPreview、flow-page-header 视觉等价比对。
- [ ] **misc**：TemplateCard 挪 business/ 同步 import、GraphicPage 跨组 css 归位、空态走 EmptyState、divination key 保留、15 处 Popconfirm 迁 ConfirmPopconfirm。
- [ ] **stock（最后一波）**：三页条件分页不传 showSizeChanger（rc-pagination total>50 原生默认）+ 显式 pageSizeOptions、4 处 locale.emptyText 透传、onRow/isStockRowClickIgnored 保留、KlineDrawer 900 保持数字透传（自绘图表未验证收窄，不收敛）、涨跌幅 span→text-stock-up/down、末尾全仓 grep AppTable 零引用删垫片。

## 既有组件处置

| 组件 | 处置 |
| --- | --- |
| `components/AppTable.tsx` | 一行 re-export 垫片 → SelfTable（stock 波末删除） |
| `components/ColumnSettings.tsx` | 原路径原样保留（audit localStorage 契约），audit 波配 useColumnSettings 推广 |
| `components/JsonView.tsx` | 原样保留（纯展示、useMemo 合规），MediaPreview JSON 折叠复用 |
| `components/permission/Permission.tsx` | 保留为权限原语（17 文件引用面），ActionCell 基于它组合而非重写权限判断 |
