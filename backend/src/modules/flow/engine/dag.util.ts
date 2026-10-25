// DAG 解析与校验工具：画布 JSON → 可执行图（拓扑分层、连通性、环节点规则、模板变量解析）。
import { FlowDag } from '../../../common/entities/flow-definition.entity';

// 引擎支持的节点类型。note 为画布备注节点，不参与执行与连线。
export const EXECUTABLE_NODE_TYPES = ['start', 'llm', 'image', 'video', 'http', 'delay', 'end'] as const;
export const ALL_NODE_TYPES = [...EXECUTABLE_NODE_TYPES, 'note'] as const;

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
}

export interface ParsedGraph {
  nodes: GraphNode[];
  edges: Array<{ id: string; source: string; target: string }>;
  nodeById: Map<string, GraphNode>;
  // 拓扑分层：同层可并行执行。
  levels: GraphNode[][];
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
}

export class DagValidationError extends Error {}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** 画布 JSON → 可执行图：结构规整 + 规则校验 + 拓扑分层，非法直接抛错。 */
export function parseGraph(dag: unknown): ParsedGraph {
  if (!dag || typeof dag !== 'object') {
    throw new DagValidationError('画布数据为空');
  }
  const { nodes, edges } = dag as FlowDag;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new DagValidationError('画布没有任何节点');
  }
  if (!Array.isArray(edges)) {
    throw new DagValidationError('画布连线数据缺失');
  }

  const nodeById = new Map<string, GraphNode>();
  for (const raw of nodes) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.type !== 'string') {
      throw new DagValidationError('存在缺少 id 或类型的节点');
    }
    if (nodeById.has(raw.id)) {
      throw new DagValidationError(`节点 ID 重复: ${raw.id}`);
    }
    if (!ALL_NODE_TYPES.includes(raw.type as (typeof ALL_NODE_TYPES)[number])) {
      throw new DagValidationError(`不支持的节点类型: ${raw.type}`);
    }
    const data = (raw.data ?? {}) as { name?: unknown; config?: unknown };
    nodeById.set(raw.id, {
      id: raw.id,
      type: raw.type,
      name: asString(data.name) || raw.type,
      config: (data.config ?? {}) as Record<string, unknown>
    });
  }

  const executableIds = new Set([...nodeById.values()].filter((n) => n.type !== 'note').map((n) => n.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of executableIds) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  const seenEdges = new Set<string>();
  for (const edge of edges) {
    const source = edge?.source;
    const target = edge?.target;
    if (typeof source !== 'string' || typeof target !== 'string') {
      throw new DagValidationError('存在缺少端点的连线');
    }
    // note 节点不参与执行图，其连线直接忽略（编辑器也不允许连）。
    if (!executableIds.has(source) || !executableIds.has(target)) {
      continue;
    }
    const key = `${source}->${target}`;
    if (source === target) {
      throw new DagValidationError('不允许节点连接自己');
    }
    if (seenEdges.has(key)) {
      continue;
    }
    seenEdges.add(key);
    outgoing.get(source)?.push(target);
    incoming.get(target)?.push(source);
  }

  // 规则：start 唯一、无入边；end 无出边。
  const starts = [...nodeById.values()].filter((n) => n.type === 'start');
  if (starts.length === 0) {
    throw new DagValidationError('缺少开始（start）节点');
  }
  if (starts.length > 1) {
    throw new DagValidationError('开始（start）节点只能有一个');
  }
  const start = starts[0];
  if ((incoming.get(start.id) ?? []).length > 0) {
    throw new DagValidationError('开始节点不允许有入边');
  }
  for (const node of nodeById.values()) {
    if (node.type === 'end' && (outgoing.get(node.id) ?? []).length > 0) {
      throw new DagValidationError(`结束节点「${node.name}」不允许有出边`);
    }
    if (node.type !== 'start' && node.type !== 'note' && (incoming.get(node.id) ?? []).length === 0) {
      throw new DagValidationError(`节点「${node.name}」没有上游连线，无法获得输入`);
    }
  }

  // Kahn 分层：同时检测环与不可达。
  const indegree = new Map<string, number>();
  for (const id of executableIds) {
    indegree.set(id, incoming.get(id)?.length ?? 0);
  }
  const levels: GraphNode[][] = [];
  let frontier = [...executableIds].filter((id) => indegree.get(id) === 0);
  const visited = new Set<string>();
  while (frontier.length > 0) {
    levels.push(frontier.map((id) => nodeById.get(id)!));
    for (const id of frontier) {
      visited.add(id);
    }
    const next: string[] = [];
    for (const id of frontier) {
      for (const target of outgoing.get(id) ?? []) {
        const remain = (indegree.get(target) ?? 0) - 1;
        indegree.set(target, remain);
        if (remain === 0) {
          next.push(target);
        }
      }
    }
    frontier = next;
  }
  if (visited.size < executableIds.size) {
    throw new DagValidationError('画布存在环路，任务流必须是有向无环图');
  }
  // 起点可达性：除 start 外的执行节点都应被访问到（入边校验已保证连通，这里兜底）。
  for (const id of executableIds) {
    if (!visited.has(id)) {
      throw new DagValidationError(`节点「${nodeById.get(id)?.name ?? id}」无法从开始节点到达`);
    }
  }

  return { nodes: [...nodeById.values()], edges, nodeById, levels, incoming, outgoing };
}

const getWithPath = (value: unknown, path: string): unknown => {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_\-]+)(?:\.([a-zA-Z0-9_.\-]+))?\s*\}\}/g;

/**
 * 模板变量解析：{{nodeId.field}}（field 支持点号子路径）引用上游节点输出。
 * context 为 { 节点ID: 输出对象 }。缺失引用按空串替换并在 collectMissing 中返回。
 */
export function renderTemplate(
  template: string,
  context: Record<string, Record<string, unknown>>,
  collectMissing?: (ref: string) => void
): string {
  return template.replace(VARIABLE_PATTERN, (_match, nodeId: string, field?: string) => {
    const nodeOutput = context[nodeId];
    if (!nodeOutput) {
      collectMissing?.(field ? `${nodeId}.${field}` : nodeId);
      return '';
    }
    const value = field ? getWithPath(nodeOutput, field) : nodeOutput;
    if (value === undefined || value === null) {
      collectMissing?.(field ? `${nodeId}.${field}` : nodeId);
      return '';
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

/** 收集模板中引用的全部变量（用于编辑器的变量提示与试运行的 mock 预填）。 */
export function collectVariables(template: string): string[] {
  const refs: string[] = [];
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const ref = match[2] ? `${match[1]}.${match[2]}` : match[1];
    if (!refs.includes(ref)) {
      refs.push(ref);
    }
  }
  return refs;
}
