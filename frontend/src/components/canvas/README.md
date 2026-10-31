# canvas — 通用无限画布基座

基于 `@xyflow/react ^12`（既有依赖，不新增第三方画布库）的**受控薄封装**。定位：给「节点即素材」的
自由画布类页面（当前为 AI 生图画布 `/ai/canvas`）提供统一基座，后续复用场景直接组合本目录组件，
不再各自封装一套 React Flow。

## 组成

| 文件 | 职责 |
| --- | --- |
| `InfiniteCanvas.tsx` | 受控画布：Background(Dots) + MiniMap(pannable/zoomable) + Controls + 工具栏插槽（`Panel top-left`）；`nodesConnectable=false`、`deleteKeyCode=null`、`zoomOnDoubleClick=false` 的 free-node 范式 |
| `nodes/ImageNode.tsx` | 图片节点：loading 骨架（Skeleton）→ antd Image（原生 `loading="lazy"` 懒加载 + 点击预览大图）→ 失败重试按钮；右上角删除（ConfirmPopconfirm 二段确认）；底部动作插槽 |
| `nodes/NoteNode.tsx` | 便签节点：点击进编辑态（TextArea），失焦保存；预设 4 色（`NOTE_COLORS`）；右上角删除确认 |
| `canvas.helpers.ts` | 纯函数：`nextNodePosition` 空位探测、`imageSizeToNode` 尺寸换算、`serializeNodeData`/`deserializeNodeData` data 白名单契约、`buildCanvasSnapshot`/`parseCanvasSnapshot` 快照构建解析 |
| `canvas.helpers.test.ts` | helpers 单测（vitest，node 环境） |

## InfiniteCanvas props

```tsx
interface InfiniteCanvasProps<T extends Node = Node> {
  nodes: T[];                       // 受控节点（页面持有状态，组件不持有）
  onNodesChange: OnNodesChange<T>;
  edges?: Edge[];                   // free-node 默认不传；有连线场景（如分镜顺序）预留
  onEdgesChange?: OnEdgesChange;
  nodeTypes: NodeTypes;             // 页面级模块常量（避免每渲染新引用）
  onInit?: OnInit<T>;               // 实例就绪：页面 setViewport 恢复视口 / fitView
  onMoveEnd?: OnMoveEnd;            // 平移/缩放结束（第二参数为最终 Viewport，自动保存用）
  children?: React.ReactNode;       // 工具栏插槽（Panel top-left）
  className?: string;
}
```

页面侧用法范式（见 `pages/ai/CanvasPage.tsx`）：

1. 页面持有 `nodes` 状态 + `useNodesState`/自管理 `onNodesChange`；
2. `nodeTypes = { image: ImageNode, note: NoteNode }` 写在组件外模块级；
3. 画布容器必须有**确定高度**（页面根用 `h-[calc(100vh-…)]` 显式高度，React Flow 撑不起百分比父级）；
4. 新节点落点用 `nextNodePosition(existing, center, size)`，生成图回填用 `imageSizeToNode(w, h)`。

## 节点 data 序列化契约（重要）

节点 `data` 分两类字段，边界是**快照是否保存**：

- **可序列化纯数据**（白名单，落快照）：
  - image：`url` / `loading` / `width` / `height` / `prompt` / `size`
  - note：`text` / `color`
- **运行时注入字段**（函数 / ReactNode，**不落快照**）：
  - image：`onDelete: () => void`、`footer: ReactNode`
  - note：`onChange: (text: string) => void`、`onDelete?: () => void`

序列化经 `serializeNodeData`（白名单并集过滤）而非裸 `JSON.stringify`——函数/ReactNode 的丢弃是
**显式契约**而非序列化的偶然副作用；恢复用 `deserializeNodeData(type, data)` 按类型过滤脏字段后，
由页面按 `node.type` **重建注入回调**（绑定最新闭包，避免恢复态持有旧值）。

快照结构（`buildCanvasSnapshot` 产出、`parseCanvasSnapshot` 解析）：

```ts
{
  version: 1,
  nodes: [{ id: string, type: string, position: { x, y }, data: <白名单纯数据> }],
  viewport: { x: number, y: number, zoom: number }  // 与 nodes 平级分开
}
```

`buildCanvasSnapshot` 会丢弃无 `url` 的 image 节点（生成中/失败残留不落快照）；`parseCanvasSnapshot`
对坏快照容错（坏节点跳过、viewport 缺失回退默认、整体不合法返回 null）。

## 复用场景登记（后续规划，均不在当前实现）

| 场景 | 思路 | 需要补的能力 |
| --- | --- | --- |
| 视频分镜故事板 | 每个 ImageNode 是一个分镜帧，`edges` 表达播放顺序 | 启用 edges + 有序连线（本基座已预留 edges/onEdgesChange props） |
| 动漫设定图对比 | 同一角色多张设定图并排 + 便签标注差异 | 现有能力即可（ImageNode + NoteNode 组合） |
| 图片叙事分镜 | 提示词模板驱动批量生成铺画布 | 复用 CanvasPage 生成面板逻辑抽成 hook |

## 测试口径

前端 vitest 无 jsdom（`vite.config.mts` 无 test 段），本目录只对纯函数（`canvas.helpers.ts`）做
单测；节点/画布 DOM 交互依赖页面人工验收。
