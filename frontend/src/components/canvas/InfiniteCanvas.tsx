// 通用无限画布基座：基于 @xyflow/react 的受控薄封装（free-node 无连线范式，节点即素材）。
// 范式：页面持有 nodes 状态（本组件不做内部 state），本组件只负责画布外观与事件转发——
// Background 网格 + MiniMap + Controls + 工具栏插槽（Panel）。节点类型注册（nodeTypes）由页面决定。
// 复用场景与 data 序列化契约见同目录 README.md。
import React from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnMoveEnd,
  type OnNodesChange,
  type OnInit
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export interface InfiniteCanvasProps<T extends Node = Node> {
  /** 受控节点数组（页面持有状态）。 */
  nodes: T[];
  onNodesChange: OnNodesChange<T>;
  /** 连线数组：free-node 范式默认不传（[]），预留有连线复用场景（如分镜顺序）。 */
  edges?: Edge[];
  onEdgesChange?: OnEdgesChange;
  /** 节点类型注册表（页面级模块常量，避免每渲染新引用触发 React Flow 重建）。 */
  nodeTypes: NodeTypes;
  /** 画布实例就绪回调：页面恢复视口（setViewport）/ fitView 用。 */
  onInit?: OnInit<T>;
  /** 平移/缩放结束：React Flow 原样转发（第二参数为最终 Viewport，自动保存用）。 */
  onMoveEnd?: OnMoveEnd;
  /** 工具栏插槽：渲染于画布左上角 Panel（生成面板/便签按钮等）。 */
  children?: React.ReactNode;
  className?: string;
}

function InfiniteCanvasInner<T extends Node = Node>({
  nodes,
  onNodesChange,
  edges,
  onEdgesChange,
  nodeTypes,
  onInit,
  onMoveEnd,
  children,
  className
}: InfiniteCanvasProps<T>) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges ?? []}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onInit={onInit}
      onMoveEnd={onMoveEnd}
      // free-node 无连线范式：节点不可连线、删除一律走节点内确认按钮（键盘直删绕过确认，禁用）。
      nodesConnectable={false}
      deleteKeyCode={null}
      // 便签双击进编辑态：禁掉双击缩放避免冲突。
      zoomOnDoubleClick={false}
      minZoom={0.1}
      maxZoom={2}
      className={className}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
      <MiniMap pannable zoomable />
      <Controls />
      {children ? <Panel position="top-left">{children}</Panel> : null}
    </ReactFlow>
  );
}

/** 受控无限画布：外层 ReactFlowProvider 提供实例上下文（页面 useReactFlow 须在其子树内）。 */
export function InfiniteCanvas<T extends Node = Node>(props: InfiniteCanvasProps<T>) {
  return (
    <ReactFlowProvider>
      <InfiniteCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
