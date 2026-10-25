// 任务流 API：流程 CRUD + 运行触发/取消/重跑/历史 + SSE 进度订阅。
import http from './http';
import { streamSse } from './sse';

// ---------- 类型 ----------

/** 开始节点变量定义。 */
export interface FlowVariable {
  name: string;
  label?: string;
  defaultValue?: string;
  required?: number;
}

/** 画布节点业务数据（React Flow node.data）。 */
export interface FlowNodeData extends Record<string, unknown> {
  name?: string;
  config?: Record<string, unknown>;
  /** 引擎节点类型（画布统一用 flow 一种展示组件）。 */
  flowType?: string;
  /** 运行时状态覆盖（running/succeeded/failed/reused/cancelled）。 */
  status?: string;
}

export interface FlowDag {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: FlowNodeData;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

export interface FlowLastRun {
  id: number;
  status: string;
  mode: string;
  durationMs?: number | null;
  finishedAt?: string | null;
  createdAt?: string;
}

export interface FlowSummary {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  version: number;
  status: number;
  sortOrder: number;
  nodeCount: number;
  updatedAt: string;
  createdAt: string;
  lastRun: FlowLastRun | null;
}

export interface FlowDetail extends FlowSummary {
  dag: FlowDag;
}

export interface FlowRunVo {
  id: number;
  flowId: number;
  flowName?: string;
  flowIcon?: string;
  mode: string;
  status: string;
  durationMs?: number | null;
  retryOf?: number | null;
  singleNodeId?: string | null;
  outputs?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
}

export interface FlowRunNodeVo {
  id: number;
  runId: number;
  nodeId: string;
  nodeType: string;
  name: string;
  status: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  modelId?: number | null;
}

export interface RunDetailVo {
  run: FlowRunVo;
  nodes: FlowRunNodeVo[];
}

export interface LatestOutputsVo {
  runId: number | null;
  context: Record<string, Record<string, unknown>>;
}

// ---------- 流程定义 ----------
export const listFlows = () => http.get<never, FlowSummary[]>('/flows');
export const getFlow = (id: number) => http.get<never, FlowDetail>(`/flows/${id}`);
export const createFlow = (payload: { name: string; description?: string; icon?: string }) =>
  http.post<never, FlowDetail>('/flows', payload);
export const updateFlow = (id: number, payload: object) =>
  http.put<never, FlowDetail>(`/flows/${id}`, payload);
export const deleteFlow = (id: number) => http.delete<never, { success: boolean }>(`/flows/${id}`);
export const duplicateFlow = (id: number) => http.post<never, FlowDetail>(`/flows/${id}/duplicate`);
export const getLatestOutputs = (id: number) =>
  http.get<never, LatestOutputsVo>(`/flows/${id}/latest-outputs`);

// ---------- 运行 ----------
export const startRun = (flowId: number, inputs: Record<string, unknown>) =>
  http.post<never, { runId: number }>(`/flows/${flowId}/runs`, { inputs });
export const startSingleRun = (payload: {
  flowId: number;
  nodeId: string;
  mockContext: Record<string, unknown>;
}) => http.post<never, { runId: number }>('/flows/runs/single', payload);
export const cancelRun = (runId: number) =>
  http.post<never, { success: boolean; status: string }>(`/flows/runs/${runId}/cancel`);
export const retryRun = (runId: number) =>
  http.post<never, { runId: number }>(`/flows/runs/${runId}/retry`);
export const listRuns = (params?: { flowId?: number; status?: string; take?: number }) =>
  http.get<never, FlowRunVo[]>('/flows/runs', { params });
export const getRunDetail = (runId: number) =>
  http.get<never, RunDetailVo>(`/flows/runs/${runId}`);

// ---------- SSE 进度（init 快照 + node/run 增量事件） ----------
export interface RunStreamHandlers {
  signal: AbortSignal;
  onInit?: (payload: { run: FlowRunVo; nodes: FlowRunNodeVo[] }) => void;
  onNode?: (
    payload: {
      nodeId: string;
      status: string;
      name?: string;
      nodeType?: string;
      durationMs?: number;
      output?: Record<string, unknown>;
      error?: string;
    }
  ) => void;
  onRunStatus?: (payload: { status: string; error?: string | null }) => void;
  onFatal?: (error: unknown) => void;
}

export const streamRun = (runId: number, handlers: RunStreamHandlers): Promise<void> =>
  streamSse(`/api/flows/runs/${runId}/stream`, {
    signal: handlers.signal,
    onEvent: (type, data) => {
      const payload = (data ?? {}) as {
        run?: FlowRunVo;
        nodes?: FlowRunNodeVo[];
        data?: Record<string, unknown>;
      };
      if (type === 'init') {
        handlers.onInit?.({ run: payload.run!, nodes: payload.nodes ?? [] });
        return;
      }
      const inner = (payload.data ?? {}) as Record<string, unknown>;
      if (type === 'node') {
        handlers.onNode?.({
          nodeId: String(inner.nodeId ?? ''),
          status: String(inner.status ?? ''),
          name: inner.name as string | undefined,
          nodeType: inner.nodeType as string | undefined,
          durationMs: inner.durationMs as number | undefined,
          output: inner.output as Record<string, unknown> | undefined,
          error: inner.error as string | undefined
        });
      } else if (type === 'run') {
        handlers.onRunStatus?.({
          status: String(inner.status ?? ''),
          error: (inner.error as string | null | undefined) ?? null
        });
      }
    },
    onError: (error) => handlers.onFatal?.(error)
  });
