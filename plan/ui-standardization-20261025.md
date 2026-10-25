# UI 规范检查 · 待办记录（2026-10-25）

> 背景：全项目 UI 规范检查 + 响应式处理。**以下问题位于并行工作流任务正在修改的文件或全局布局文件，为避免冲突未改动，待 flow 任务完成后统一修改。**
> 已完成修复（安全文件）见文末。统一刻度约定：sm=640 / md=768 / lg=1024 / xl=1280（Tailwind v4 默认）。

## ✅ P0 · 已解除（2026-10-25 22:55 并行任务自行修复，验证后端 started + 登录正常）

### 1. 后端启动失败：novel 实体缺显式列类型（已修）
- 文件：`backend/src/common/entities/novel-project.entity.ts`
- 现象：`Data type "Object" in "NovelProject.finalVideoPath" is not supported by "mysql"`，nest watch 起不来，**全站接口 500**
- 原因：`finalVideoPath?: string | null` 这类 `| null` 联合类型让 TypeORM 反射为 Object
- 修法：`@Column({ name: 'final_video_path', type: 'varchar', length: 255, nullable: true })`
- 状态：任务方已补显式类型，后端 22:55 successfully started，登录接口恢复正常

## ✅ P1 · 全站响应式（2026-10-25 晚已修复，flow 任务已收工）

### 2. Sider 无响应式断点（已修复）
- 文件：`frontend/src/layouts/MainLayout.tsx:250`（`<Sider width={240} collapsedWidth={64}>`）
- 实测（375px）：侧边栏固定 240px，**内容区只剩 135px**，快照卡/工具栏全部竖排堆叠（users 页筛选卡高达 265px）
- 建议：Sider 加 `breakpoint="lg"`（<1024 自动收起为 64px）；或 <768 用 Drawer 抽屉菜单
- 768px 佐证：内容区 528px（侧栏占 31%），分析台工具行输入框被压至约 40px 宽
- **修复实现**（踩坑记录）：
  1. antd Sider `breakpoint="lg"` + `onBreakpoint` 同步 React 状态（isNarrow）；`effectiveCollapsed = isNarrow || collapsed` 统一驱动侧栏视觉与 app-main margin（跨断点时生效）
  2. **mount 时不触发 onBreakpoint**（仅跨越断点回调）→ 窄屏首屏由 global.css 媒体查询兜底（`@media (max-width: 1023.9px)` 下 `.app-sider` 64px + `.app-main` margin + `.app-header` 定位，样式表 !important 稳赢 antd 内联，无竞态）
  3. **踩坑**：曾尝试 React 内联 `setProperty('width', 'important')`——antd 在 resize 时重写同一内联槽位（无 important）导致竞态回退，已放弃该方案
  4. **踩坑**：global.css 旧的 `.app-sider width: var() !important` 与 antd 打架的规则已移除（其 var 求值曾出现 240/64 不一致的诡异行为，重构成 CSS 兜底后问题消散）
- 复测：375 内容区 135→**311px**（+130%）、768 528→**704px**、1440 桌面 1200px 不受影响
- 连带：`MainLayout.tsx:301` 的 `style={{ marginLeft: siderWidth }}` 同步受影响

### 3. 断点刻度碎片化（已部分统一）
- `styles/global.css`：原 640/900/992/1024/1280 五种混用；**992→1024 已修**，其余保留：
  - 900：stock 圆桌环形布局塌缩点（`pages/stock/stock.css`），行为正确不动
  - 640/1024/1280：已与 Tailwind 刻度一致
- 后续新代码统一用 Tailwind 前缀（`sm: md: lg: xl:`）而不是散落 @media；目前全 pages 只有 2 处用了响应式前缀

## 🟢 P2 · flow 任务范围内的 UI 规范项（由该任务自行处理）

### 4. pages/flow/**
- FlowEditorPage / NodeConfigPanel / FlowsPage 均在活跃开发中，未纳入本次检查
- 提示：编辑器抽屉类组件注意 `width` 在 <768 的表现（建议 `min(90vw, NNNpx)`）；流程跑的 `flowRunUI` 里的状态色建议同样走语义 token

### 5. pages/ai/ModelsPage.tsx（已修复）
- `w-[120px]` → `w-full sm:w-[120px]`（窄屏占满行、桌面保持紧凑）

## ✅ 已完成修复（安全文件，本次落地）

1. **A股红涨绿跌语义色 token 化**：`global.css @theme` 新增 `--color-stock-up/down`，生成 `text-stock-up/down`、`bg-stock-up/down` 工具类；RoundtableStage 投票条、HistoryTable 投票列、SubjectPicker 快照涨跌、experts.ts STANCE_COLOR、useRoundtableFlow conclusionColor 全部改引 token（消除了 9 处硬编码 `#f5222d`/`#16a34a`）
2. **Tag 间距规范**：新增 `.ant-tag.tag-flat` 工具类，替换 ExpertCard/TimelineView 共 6 处 `style={{ marginInlineEnd: 0 }}` 内联
3. **PublishPage**：`text-[#999]` → `text-text-sub` token
4. **登录页断点**：992px → 1024px（统一刻度）
5. K 线图 UP_COLOR/DOWN_COLOR、流派色板保留 hex（echarts 不支持 CSS 变量；色板需拼透明度），属合理例外
6. 回归：tsc 无新增错误、`npm run build` 通过

## 📋 验证数据存档

| 视口 | 页面 | 横向溢出 | 内容区宽度 | 备注 |
|---|---|---|---|---|
| 375px | /stock | 0 | 135px | ❌ Sider 240 固定（P1-2） |
| 375px | /users | 0 | 135px | 筛选卡折成 265px 高 |
| 1440px | /stock | 0 | ~1077px | ✅ 早前截图验证 |
| 768px | /stock | 0 | 528px | ⚠️ 可用但工具行偏挤（输入框被压窄），根因 P1-2 Sider 固定 240；修复后 768 内容区将增至 ~672px 自然缓解 |
