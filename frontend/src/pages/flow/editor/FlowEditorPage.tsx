// 任务流编辑器（全屏）：左侧节点面板 + React Flow 画布 + 右侧配置面板 + 底部运行控制台。
// 调试三件套：完整运行（SSE 实时节点状态）、单节点试运行（mock 上下文预填）、断点重跑。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodesChange,
  type EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Alert,
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ExperimentOutlined,
  PartitionOutlined,
  SaveOutlined
} from '@ant-design/icons';
import { useAppSelector } from '../../../store/hooks';
import {
  FlowDetail,
  FlowDag,
  FlowNodeData,
  FlowRunVo,
  FlowVariable,
  cancelRun as apiCancelRun,
  getFlow,
  getLatestOutputs,
  getRunDetail,
  retryRun as apiRetryRun,
  startRun,
  startSingleRun,
  streamRun,
  updateFlow
} from '../../../api/flows';
import { listModels } from '../../../api/ai';
import type { AiModel } from '../../../api/ai';
import { Permission } from '../../../components/permission/Permission';
import { NODE_META, nodeMetaByKey, nextNodeName } from './nodeMeta';
import { FlowNodeCard, type FlowCanvasNode } from './FlowNodeCard';
import { NodeConfigPanel } from './NodeConfigPanel';
import { RunPanel, type RunLogLine, formatLogTime } from './RunPanel';
import { formatDuration } from '../flowRunUI';
import './editor.css';

const nodeTypes = { flow: FlowNodeCard };

/** 窄屏（平板/小窗口）检测：编辑器在小屏切换为「面板浮层」形态。 */
const useIsNarrow = (): boolean => {
  const [narrow, setNarrow] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 1024px)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1024px)');
    const handler = (event: MediaQueryListEvent) => setNarrow(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);
  return narrow;
};

const genNodeId = (type: string) => `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 画布 ↔ 存储结构互转（存储层 node.type = 引擎类型）。 */
const dagToCanvas = (dag: FlowDag) => ({
  nodes: dag.nodes.map<FlowCanvasNode>((node) => ({
    id: node.id,
    type: 'flow',
    position: node.position,
    data: { name: node.data?.name, config: node.data?.config ?? {}, flowType: node.type }
  })),
  edges: dag.edges.map<Edge>((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#bfbfbf' },
    style: { stroke: '#bfbfbf', strokeWidth: 1.5 }
  }))
});

/** 本地画布校验（与后端规则一致，保存前即时反馈）。 */
const validateCanvas = (nodes: FlowCanvasNode[], edges: Edge[]): string[] => {
  const errors: string[] = [];
  const executable = nodes.filter((node) => (node.data.flowType ?? '') !== 'note');
  const starts = executable.filter((node) => node.data.flowType === 'start');
  if (starts.length === 0) {
    errors.push('缺少「开始」节点');
  }
  if (starts.length > 1) {
    errors.push('「开始」节点只能有一个');
  }
  const incoming = new Map<string, number>();
  executable.forEach((node) => incoming.set(node.id, 0));
  const outgoing = new Map<string, string[]>();
  executable.forEach((node) => outgoing.set(node.id, []));
  edges.forEach((edge) => {
    if (incoming.has(edge.target) && outgoing.has(edge.source)) {
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
      outgoing.get(edge.source)?.push(edge.target);
    }
  });
  if (starts.length === 1 && (incoming.get(starts[0].id) ?? 0) > 0) {
    errors.push('「开始」节点不允许有入边');
  }
  executable.forEach((node) => {
    if (node.data.flowType === 'end' && (outgoing.get(node.id) ?? []).length > 0) {
      errors.push(`结束节点「${node.data.name}」不允许有出边`);
    }
    if (!['start', 'note'].includes(node.data.flowType ?? '') && (incoming.get(node.id) ?? 0) === 0) {
      errors.push(`节点「${node.data.name ?? node.id}」没有上游连线`);
    }
  });
  // 环检测（Kahn）
  const indegree = new Map(incoming);
  const queue = [...indegree.entries()].filter(([, value]) => value === 0).map(([key]) => key);
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited.add(id);
    for (const next of outgoing.get(id) ?? []) {
      const remain = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remain);
      if (remain === 0) {
        queue.push(next);
      }
    }
  }
  if (visited.size < executable.length) {
    errors.push('画布存在环路，任务流必须是有向无环图');
  }
  return errors;
};

/** 收集节点配置里引用的变量（试运行 mock 表单用）。 */
const collectRefs = (config: Record<string, unknown> | undefined): string[] => {
  const refs: string[] = [];
  const push = (text: unknown) => {
    if (typeof text !== 'string') {
      return;
    }
    for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_\-]+)(?:\.([a-zA-Z0-9_.\-]+))?\s*\}\}/g)) {
      const ref = match[2] ? `${match[1]}.${match[2]}` : match[1];
      if (!refs.includes(ref)) {
        refs.push(ref);
      }
    }
  };
  ['systemPrompt', 'prompt', 'firstFrame', 'url', 'body'].forEach((key) => push(config?.[key]));
  if (Array.isArray(config?.fields)) {
    (config.fields as Array<{ value?: unknown }>).forEach((field) => push(field.value));
  }
  return refs;
};

const FlowEditorInner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const flowId = Number(id);
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();
  const { screenToFlowPosition } = useReactFlow();

  const permissions = useAppSelector((state) => state.auth.profile?.permissions ?? []);
  const canManageModels = permissions.includes('ai:model:manage');
  const canExecute = permissions.includes('flow:run:execute');

  const [flow, setFlow] = useState<FlowDetail | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowCanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<AiModel[]>([]);

  // 运行态
  const [run, setRun] = useState<FlowRunVo | null>(null);
  const [logs, setLogs] = useState<RunLogLine[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 弹层
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [trialTarget, setTrialTarget] = useState<FlowCanvasNode | null>(null);
  const [mockValues, setMockValues] = useState<Record<string, string>>({});
  const [runForm] = Form.useForm<Record<string, string>>();
  const [mockForm] = Form.useForm<Record<string, string>>();

  // 窄屏：节点面板默认收起、配置面板走浮层抽屉
  const isNarrow = useIsNarrow();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // 拖动位置/删除等结构性变更也要点亮「未保存」，避免布局丢失。
  const handleNodesChange: OnNodesChange<FlowCanvasNode> = useCallback(
    (changes: NodeChange<FlowCanvasNode>[]) => {
      onNodesChange(changes);
      if (changes.some((change) => change.type === 'position' || change.type === 'remove')) {
        setDirty(true);
      }
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      if (changes.some((change) => change.type === 'remove')) {
        setDirty(true);
      }
    },
    [onEdgesChange]
  );

  const appendLog = useCallback((text: string, kind: RunLogLine['kind'] = 'info') => {
    setLogs((prev) => [...prev, { key: `${Date.now()}-${Math.random()}`, time: formatLogTime(), text, kind }]);
  }, []);

  const loadFlow = useCallback(async () => {
    const detail = await getFlow(flowId);
    setFlow(detail);
    const canvas = dagToCanvas(detail.dag);
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
    setDirty(false);
  }, [flowId, setNodes, setEdges]);

  useEffect(() => {
    if (Number.isFinite(flowId)) {
      loadFlow().catch((error: unknown) => {
        message.error(error instanceof Error ? error.message : '加载失败');
      });
    }
    if (canManageModels) {
      listModels()
        .then(setModels)
        .catch(() => setModels([]));
    }
  }, [flowId, loadFlow, message, canManageModels]);

  // 离开页面前提示未保存
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // SSE 断开清理
  useEffect(() => abortRef.current?.abort(), []);

  const upstreamOf = useCallback(
    (nodeId: string): FlowCanvasNode[] => {
      // 沿入边回溯全部上游（含间接）。
      const incomingMap = new Map<string, string[]>();
      edges.forEach((edge) => {
        const list = incomingMap.get(edge.target) ?? [];
        list.push(edge.source);
        incomingMap.set(edge.target, list);
      });
      const result: FlowCanvasNode[] = [];
      const seen = new Set<string>();
      const walk = (id: string) => {
        for (const source of incomingMap.get(id) ?? []) {
          if (seen.has(source)) {
            continue;
          }
          seen.add(source);
          const node = nodes.find((item) => item.id === source);
          if (node) {
            result.push(node);
          }
          walk(source);
        }
      };
      walk(nodeId);
      return result;
    },
    [edges, nodes]
  );

  const patchNode = useCallback(
    (nodeId: string, patch: { name?: string; config?: Record<string, unknown> }) => {
      setDirty(true);
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  name: patch.name ?? node.data.name,
                  config: patch.config ?? node.data.config
                }
              }
            : node
        )
      );
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setDirty(true);
      setNodes((prev) => prev.filter((node) => node.id !== nodeId));
      setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setEdges, setNodes]
  );

  const addNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      setDirty(true);
      const meta = nodeMetaByKey(type);
      const name = nextNodeName(
        nodes.map((node) => ({ id: node.id, type: node.data.flowType ?? 'llm', position: node.position, data: node.data })),
        type
      );
      setNodes((prev) => [
        ...prev.map((node) => ({ ...node, selected: false })),
        {
          id: genNodeId(type),
          type: 'flow' as const,
          position,
          data: { name, config: meta?.defaultConfig() ?? {}, flowType: type }
        }
      ]);
    },
    [nodes, setNodes]
  );

  // 连线合法性：自连/环/开始入边/结束出边/备注一律拒绝。
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) {
        return false;
      }
      const sourceNode = nodes.find((node) => node.id === source);
      const targetNode = nodes.find((node) => node.id === target);
      const sourceType = sourceNode?.data.flowType ?? '';
      const targetType = targetNode?.data.flowType ?? '';
      if (sourceType === 'note' || targetType === 'note') {
        return false;
      }
      if (targetType === 'start' || sourceType === 'end') {
        return false;
      }
      // 环检测：target 若已能到达 source 则拒绝。
      const adjacency = new Map<string, string[]>();
      edges.forEach((edge) => {
        const list = adjacency.get(edge.source) ?? [];
        list.push(edge.target);
        adjacency.set(edge.source, list);
      });
      const stack = [target];
      const visited = new Set<string>();
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === source) {
          return false;
        }
        if (visited.has(current)) {
          continue;
        }
        visited.add(current);
        stack.push(...(adjacency.get(current) ?? []));
      }
      return true;
    },
    [edges, nodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setDirty(true);
      setEdges((prev) =>
        addEdge(
          {
            ...connection,
            id: `e-${connection.source}-${connection.target}`,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#bfbfbf' },
            style: { stroke: '#bfbfbf', strokeWidth: 1.5 }
          },
          prev
        )
      );
    },
    [setEdges]
  );

  // 自动整理：按拓扑层级网格排列（note 节点不动）。
  const autoLayout = useCallback(() => {
    const adjacency = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    nodes.forEach((node) => {
      if ((node.data.flowType ?? '') !== 'note') {
        indegree.set(node.id, 0);
      }
    });
    edges.forEach((edge) => {
      if (indegree.has(edge.target) && indegree.has(edge.source)) {
        indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
        const list = adjacency.get(edge.source) ?? [];
        list.push(edge.target);
        adjacency.set(edge.source, list);
      }
    });
    const levels: string[][] = [];
    let frontier = [...indegree.entries()].filter(([, value]) => value === 0).map(([key]) => key);
    while (frontier.length > 0) {
      levels.push(frontier);
      const next: string[] = [];
      for (const id of frontier) {
        for (const target of adjacency.get(id) ?? []) {
          const remain = (indegree.get(target) ?? 0) - 1;
          indegree.set(target, remain);
          if (remain === 0) {
            next.push(target);
          }
        }
      }
      frontier = next;
    }
    // 每层相对最宽层垂直居中：跨层连线也尽量走同一水平中线，减少拐弯。
    const maxCount = Math.max(...levels.map((ids) => ids.length), 1);
    setDirty(true);
    setNodes((prev) =>
      prev.map((node) => {
        const level = levels.findIndex((ids) => ids.includes(node.id));
        if (level < 0) {
          return node; // note 或孤立节点保持原位
        }
        const indexInLevel = levels[level].indexOf(node.id);
        const yOffset = ((maxCount - levels[level].length) / 2) * 150;
        return { ...node, position: { x: level * 300, y: yOffset + indexInLevel * 150 } };
      })
    );
    message.success('已按拓扑层级整理');
  }, [edges, nodes, setNodes, message]);

  const serializeDag = useCallback((): FlowDag => {
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.data.flowType ?? 'llm',
        position: node.position,
        data: { name: node.data.name, config: node.data.config ?? {} }
      })),
      edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
    };
  }, [edges, nodes]);

  const save = useCallback(async () => {
    const errors = validateCanvas(nodes, edges);
    if (errors.length > 0) {
      modal.error({ title: '画布校验未通过', content: <ul style={{ paddingLeft: 18 }}>{errors.map((item) => <li key={item}>{item}</li>)}</ul> });
      return;
    }
    setSaving(true);
    try {
      await updateFlow(flowId, { dag: serializeDag() });
      await loadFlow();
      message.success('已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, flowId, serializeDag, loadFlow, message, modal]);

  const checkCanvasBeforeRun = useCallback((): boolean => {
    const errors = validateCanvas(nodes, edges);
    if (errors.length > 0) {
      modal.error({ title: '画布校验未通过，无法运行', content: <ul style={{ paddingLeft: 18 }}>{errors.map((item) => <li key={item}>{item}</li>)}</ul> });
      return false;
    }
    if (dirty) {
      message.warning('有未保存的修改，请先保存再运行');
      return false;
    }
    return true;
  }, [nodes, edges, dirty, modal, message]);

  // ---------- SSE 订阅 ----------
  const subscribeRun = useCallback(
    (runId: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setPanelOpen(true);
      appendLog(`运行 #${runId} 已启动`, 'info');
      void streamRun(runId, {
        signal: controller.signal,
        onInit: ({ run: initRun, nodes: initNodes }) => {
          setRun(initRun);
          setNodes((prev) =>
            prev.map((node) => {
              const record = initNodes.find((item) => item.nodeId === node.id);
              return { ...node, data: { ...node.data, status: record?.status } };
            })
          );
        },
        onNode: (payload) => {
          setNodes((prev) =>
            prev.map((node) => (node.id === payload.nodeId ? { ...node, data: { ...node.data, status: payload.status } } : node))
          );
          if (payload.status === 'succeeded') {
            appendLog(`节点「${payload.name ?? payload.nodeId}」成功${payload.durationMs ? `（${formatDuration(payload.durationMs)}）` : ''}`, 'success');
            setEdges((prev) => prev.map((edge) => (edge.source === payload.nodeId ? { ...edge, animated: true } : edge)));
          } else if (payload.status === 'failed') {
            appendLog(`节点「${payload.name ?? payload.nodeId}」失败：${payload.error ?? '未知错误'}`, 'error');
          } else if (payload.status === 'reused') {
            appendLog(`节点「${payload.name ?? payload.nodeId}」复用上次产物，跳过执行`, 'muted');
          }
        },
        onRunStatus: async (payload) => {
          setRun((prev) => (prev ? { ...prev, status: payload.status, error: payload.error } : prev));
          if (payload.status === 'succeeded') {
            appendLog('运行完成 ✅', 'success');
            try {
              const detail = await getRunDetail(runId);
              setRun(detail.run);
            } catch {
              // 详情拉取失败不影响状态展示
            }
          } else if (payload.status === 'failed') {
            appendLog(`运行失败：${payload.error ?? '未知错误'}`, 'error');
          } else if (payload.status === 'cancelled') {
            appendLog('运行已取消', 'muted');
          }
          setRunning(false);
        },
        onFatal: (error) => {
          if (!controller.signal.aborted) {
            appendLog(`进度连接中断，可到运行历史查看结果（${error instanceof Error ? error.message : '网络异常'}）`, 'error');
            setRunning(false);
          }
        }
      });
    },
    [appendLog, setEdges, setNodes]
  );

  const startVariables = useMemo<FlowVariable[]>(
    () =>
      ((nodes.find((node) => node.data.flowType === 'start')?.data.config?.variables as FlowVariable[] | undefined) ?? []),
    [nodes]
  );

  const openRunModal = useCallback(() => {
    if (!checkCanvasBeforeRun()) {
      return;
    }
    const defaults: Record<string, string> = {};
    startVariables.forEach((variable) => {
      defaults[variable.name] = variable.defaultValue ?? '';
    });
    runForm.setFieldsValue(defaults);
    setRunModalOpen(true);
  }, [checkCanvasBeforeRun, runForm, startVariables]);

  const submitRun = useCallback(async () => {
    const values = await runForm.validateFields();
    setRunModalOpen(false);
    setLogs([]);
    setEdges((prev) => prev.map((edge) => ({ ...edge, animated: false })));
    setNodes((prev) => prev.map((node) => ({ ...node, data: { ...node.data, status: undefined } })));
    setRun(null);
    try {
      const { runId } = await startRun(flowId, values);
      subscribeRun(runId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '启动失败');
    }
  }, [runForm, setEdges, setNodes, flowId, subscribeRun, message]);

  // ---------- 试运行 ----------
  const openTrialModal = useCallback(
    async (node: FlowCanvasNode) => {
      if (!checkCanvasBeforeRun()) {
        return;
      }
      setTrialTarget(node);
      setMockValues({});
      const refs = collectRefs(node.data.config);
      const prefill: Record<string, string> = {};
      try {
        const { context } = await getLatestOutputs(flowId);
        refs.forEach((ref) => {
          const [nodeId, ...fieldPath] = ref.split('.');
          const value = fieldPath.length > 0 ? context[nodeId]?.[fieldPath[0]] : undefined;
          prefill[ref] = typeof value === 'string' ? value : value !== undefined ? JSON.stringify(value) : '';
        });
      } catch {
        // 预填失败按空处理
      }
      // start 节点试运行：变量名作为 mock 键。
      if (node.data.flowType === 'start') {
        ((node.data.config?.variables as FlowVariable[] | undefined) ?? []).forEach((variable) => {
          prefill[variable.name] = variable.defaultValue ?? '';
        });
      }
      mockForm.setFieldsValue(prefill);
      setMockValues(prefill);
    },
    [checkCanvasBeforeRun, flowId, mockForm]
  );

  const submitTrial = useCallback(async () => {
    if (!trialTarget) {
      return;
    }
    const values = await mockForm.validateFields();
    setTrialTarget(null);
    setLogs([]);
    setRun(null);
    // {{nodeId.field}} → mockContext[nodeId][field]
    const mockContext: Record<string, Record<string, unknown>> = {};
    const isStart = trialTarget.data.flowType === 'start';
    Object.entries(values).forEach(([key, value]) => {
      if (isStart) {
        // start 试运行：入参按变量名挂在 start 节点槽位。
        mockContext[trialTarget.id] = { ...(mockContext[trialTarget.id] ?? {}), [key]: value };
        return;
      }
      const [nodeId, ...fieldPath] = key.split('.');
      const field = fieldPath.join('.');
      mockContext[nodeId] = { ...(mockContext[nodeId] ?? {}), [field]: value };
    });
    appendLog(`试运行节点「${trialTarget.data.name ?? trialTarget.id}」`, 'info');
    try {
      const { runId } = await startSingleRun({ flowId, nodeId: trialTarget.id, mockContext });
      setPanelOpen(true);
      subscribeRun(runId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '试运行失败');
    }
  }, [trialTarget, mockForm, flowId, appendLog, subscribeRun, message]);

  const cancelCurrentRun = useCallback(async () => {
    if (!run) {
      return;
    }
    try {
      await apiCancelRun(run.id);
      message.success('已请求取消');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '取消失败');
    }
  }, [run, message]);

  const retryCurrentRun = useCallback(async () => {
    if (!run) {
      return;
    }
    setLogs([]);
    setNodes((prev) => prev.map((node) => ({ ...node, data: { ...node.data, status: undefined } })));
    setEdges((prev) => prev.map((edge) => ({ ...edge, animated: false })));
    try {
      const { runId } = await apiRetryRun(run.id);
      subscribeRun(runId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重跑失败');
    }
  }, [run, setEdges, setNodes, subscribeRun, message]);

  const onNodeClick: NodeMouseHandler<FlowCanvasNode> = useCallback(
    (_event, node) => {
      setNodes((prev) => prev.map((item) => ({ ...item, selected: item.id === node.id })));
    },
    [setNodes]
  );

  const onPaneClick = useCallback(() => {
    setNodes((prev) => prev.map((item) => ({ ...item, selected: false })));
  }, [setNodes]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/flow-type');
      if (!type || !nodeMetaByKey(type)) {
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type, position);
    },
    [addNode, screenToFlowPosition]
  );

  const selected = nodes.find((node) => node.selected) ?? null;

  // 配置面板内容（宽屏内联 / 窄屏浮层抽屉复用同一份）。
  const configPanelElement = selected ? (
    <NodeConfigPanel
      node={selected}
      upstream={upstreamOf(selected.id)}
      models={models}
      canManageModels={canManageModels}
      canExecute={canExecute}
      variant={isNarrow ? 'drawer' : 'inline'}
      onChange={(patch) => patchNode(selected.id, patch)}
      onDelete={() => deleteNode(selected.id)}
      onTrialRun={() => void openTrialModal(selected)}
    />
  ) : null;

  const paletteElement = (
    <div className={`flow-palette${isNarrow ? ' overlay' : ''}${isNarrow && paletteOpen ? ' open' : ''}`}>
      {isNarrow && (
        <Button
          size="small"
          type="text"
          className="flow-palette-close"
          icon={<CloseOutlined />}
          onClick={() => setPaletteOpen(false)}
        />
      )}
      <div className="flow-palette-title">节点类型（拖入画布）</div>
      {NODE_META.map((meta) => {
        const Icon = meta.icon;
        return (
              <div
                key={meta.key}
                className="flow-palette-item"
                draggable
                title={meta.description}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/flow-type', meta.key);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addNode(meta.key, screenToFlowPosition({ x: 200 + Math.random() * 120, y: 160 + Math.random() * 120 }))}
              >
                <span className="flow-palette-item-icon" style={{ background: meta.color }}>
                  <Icon />
                </span>
                <div className="flow-palette-item-text">
                  <div className="flow-palette-item-label">{meta.label}</div>
                  <div className="flow-palette-item-desc">{meta.description}</div>
                </div>
              </div>
        );
      })}
    </div>
  );

  if (!flow) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin tip="加载任务流…" />
      </div>
    );
  }

  return (
    <div className={isNarrow ? 'flow-editor narrow' : 'flow-editor'}>
      <div className="flow-editor-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/flow')} />
        <span style={{ fontSize: 22 }}>{flow.icon}</span>
        <Typography.Title level={5} className="flow-editor-title">
          {flow.name}
        </Typography.Title>
        <Tag>V{flow.version}</Tag>
        {dirty && <Tag color="orange">未保存</Tag>}
        <span style={{ flex: 1 }} />
        <Space wrap>
          {isNarrow && (
            <Button
              icon={<AppstoreOutlined />}
              onClick={() => setPaletteOpen((prev) => !prev)}
              title="节点面板"
            />
          )}
          <Button icon={<PartitionOutlined />} onClick={autoLayout}>
            自动整理
          </Button>
          <Permission code="flow:define:manage">
            <Button icon={<SaveOutlined />} onClick={save} loading={saving} type={dirty ? 'primary' : 'default'}>
              保存
            </Button>
          </Permission>
          <Permission code="flow:run:execute">
            <Button
              type="primary"
              icon={<CaretRightOutlined />}
              onClick={openRunModal}
              disabled={running}
            >
              {running ? '运行中…' : '运行'}
            </Button>
          </Permission>
        </Space>
      </div>
      <div className="flow-editor-body" style={{ flex: 1, minHeight: 0 }}>
        {(!isNarrow || paletteOpen) && paletteElement}
        <div className="flow-canvas-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            fitView
            snapToGrid
            snapGrid={[8, 8]}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.2}
            maxZoom={1.8}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls position="bottom-right" />
            <MiniMap
              position="bottom-left"
              style={{ width: 170, height: 110 }}
              maskColor="rgba(245, 245, 245, 0.78)"
              nodeColor={(node) => nodeMetaByKey((node.data as FlowNodeData).flowType ?? '')?.color ?? '#d9d9d9'}
              nodeStrokeWidth={2}
            />
          </ReactFlow>
        </div>
        {!isNarrow && configPanelElement}
        {isNarrow && (
          <Drawer
            title="节点配置"
            placement="right"
            width="min(92vw, 360px)"
            open={Boolean(selected)}
            onClose={onPaneClick}
            styles={{ body: { padding: 0 } }}
            destroyOnClose
          >
            {configPanelElement}
          </Drawer>
        )}
      </div>
      <RunPanel
        open={panelOpen}
        onToggle={() => setPanelOpen((prev) => !prev)}
        run={run}
        logs={logs}
        onCancel={cancelCurrentRun}
        onRetry={retryCurrentRun}
      />

      <Modal
        title={
          <Space>
            <CaretRightOutlined />
            运行任务流
          </Space>
        }
        open={runModalOpen}
        onOk={() => void submitRun()}
        onCancel={() => setRunModalOpen(false)}
        okText="开始运行"
        forceRender
        destroyOnClose
      >
        {startVariables.length === 0 ? (
          <Alert type="info" message="开始节点未定义变量，将直接执行。" />
        ) : (
          <Form form={runForm} layout="vertical">
            {startVariables.map((variable) => (
              <Form.Item
                key={variable.name}
                name={variable.name}
                label={variable.label ? `${variable.label}（${variable.name}）` : variable.name}
                rules={variable.required ? [{ required: true, message: `请输入 ${variable.label ?? variable.name}` }] : []}
              >
                <Input.TextArea rows={2} placeholder="运行入参" autoComplete="off" />
              </Form.Item>
            ))}
          </Form>
        )}
      </Modal>

      <Drawer
        title={
          <Space>
            <ExperimentOutlined />
            试运行：{trialTarget?.data.name ?? ''}
          </Space>
        }
        open={Boolean(trialTarget)}
        onClose={() => setTrialTarget(null)}
        width={460}
        forceRender
        destroyOnClose
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setTrialTarget(null)}>取消</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => void submitTrial()}>
              执行试运行
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="只执行该节点"
          description="以下变量已按最近一次成功运行预填，可直接修改后单步执行，用于快速调试提示词与参数。"
          style={{ marginBottom: 16 }}
        />
        <Form form={mockForm} layout="vertical" onValuesChange={(_, values) => setMockValues(values)}>
          {Object.keys(mockValues).length === 0 && <div style={{ color: '#999' }}>该节点没有上游变量依赖。</div>}
          {Object.keys(mockValues).map((ref) => (
            <Form.Item key={ref} name={ref} label={<code>{`{{${ref}}}`}</code>}>
              <Input.TextArea rows={2} placeholder="mock 值" autoComplete="off" />
            </Form.Item>
          ))}
        </Form>
      </Drawer>
    </div>
  );
};

export const FlowEditorPage: React.FC = () => (
  <ReactFlowProvider>
    <AntApp>
      <FlowEditorInner />
    </AntApp>
  </ReactFlowProvider>
);
