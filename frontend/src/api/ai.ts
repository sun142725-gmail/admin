// AI 模块 API：模型（端点+密钥一体）/智能体/对话/生图。
// AI 生图/模型探测等长任务单独放宽超时：全局 10s 会让这类请求必然 ECONNABORTED
const LONG_TASK_TIMEOUT = 180000;
import http from './http';
import { store } from '../store';
import { canvasKeepaliveBody } from '../components/canvas/canvasAutosave';
import { streamSse } from './sse';

// ---------- 类型 ----------
export interface AiModel {
  id: number;
  modelKey: string;
  displayName: string;
  type: string;
  baseUrl: string;
  apiKeyMask: string;
  capabilities: string[];
  // 默认采样参数 JSON：{ temperature, topP, maxTokens }；视频模型另可含 protocol 协议声明。
  defaultParams?: Record<string, unknown> | null;
  contextLength: number;
  maxOutput: number;
  priority: number;
  weight: number;
  remark?: string;
  status: number;
  createdAt?: string;
}

export interface AiAgent {
  id: number;
  name: string;
  description?: string;
  kind: 'native' | 'dify';
  code?: string;
  modelId?: number;
  baseUrl?: string;
  apiKeyMask?: string;
  systemPrompt?: string;
  temperature: number;
  topP?: number;
  maxTokens?: number;
  openingLine?: string;
  allowImage: number;
  sort: number;
  status: number;
  createdAt?: string;
}

export interface AiAgentSummary {
  id: number;
  name: string;
  description?: string;
  kind: string;
  modelId?: number;
  openingLine?: string;
  allowImage: number;
}

export interface AiConversation {
  id: number;
  title: string;
  agentId?: number;
  modelId?: number;
  updatedAt?: string;
}

export interface AiChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: string;
  status: string;
  createdAt?: string;
}

export interface AiImageRecord {
  id: number;
  prompt: string;
  size?: string;
  url: string;
  status: string;
  createdAt?: string;
}

export interface ProbeResultVo {
  ok: boolean;
  models?: string[];
  message?: string;
}

// ---------- 模型（一行 = 端点：协议/地址/密钥） ----------
export const listModels = () => http.get<never, AiModel[]>('/ai/admin/models');
export const createModel = (payload: object) => http.post<never, AiModel>('/ai/admin/models', payload);
export const updateModel = (id: number, payload: object) =>
  http.put<never, AiModel>(`/ai/admin/models/${id}`, payload);
export const removeModel = (id: number) => http.delete<never, { success: boolean }>(`/ai/admin/models/${id}`);
export const testModel = (id: number) =>
  http.post<never, ProbeResultVo>(`/ai/admin/models/${id}/test`, undefined, { timeout: LONG_TASK_TIMEOUT });
export const probeModelModels = (id: number) =>
  http.post<never, ProbeResultVo>(`/ai/admin/models/${id}/probe-models`, undefined, {
    timeout: LONG_TASK_TIMEOUT
  });

// ---------- 智能体 ----------
export const listAgents = () => http.get<never, AiAgent[]>('/ai/admin/agents');
export const createAgent = (payload: object) => http.post<never, AiAgent>('/ai/admin/agents', payload);
export const updateAgent = (id: number, payload: object) =>
  http.put<never, AiAgent>(`/ai/admin/agents/${id}`, payload);
export const removeAgent = (id: number) => http.delete<never, { success: boolean }>(`/ai/admin/agents/${id}`);
export const listEnabledAgents = () => http.get<never, AiAgentSummary[]>('/ai/agents/enabled');

// ---------- 对话 ----------
export const listConversations = () => http.get<never, AiConversation[]>('/ai/chat/conversations');
export const listConversationMessages = (id: number) =>
  http.get<never, AiChatMessage[]>(`/ai/chat/conversations/${id}/messages`);
export const renameConversation = (id: number, title: string) =>
  http.put<never, { success: boolean }>(`/ai/chat/conversations/${id}/title`, { title });
export const removeConversation = (id: number) =>
  http.delete<never, { success: boolean }>(`/ai/chat/conversations/${id}`);

export interface ChatSubmitResult {
  conversationId: number;
  messageId: number;
}

// 第一步：提交内容（返回 messageId 供 SSE 订阅）。
export const submitChat = (payload: {
  conversationId?: number;
  agentId?: number;
  modelId?: number;
  content: string;
}) => http.post<never, ChatSubmitResult>('/ai/chat/completions', payload);

// 第二步：SSE 订阅生成流（chunk / done / error）。
export const streamChat = (
  messageId: number,
  handlers: {
    signal: AbortSignal;
    onChunk?: (text: string) => void;
    onDone?: () => void;
    onError?: (message: string) => void;
    onFatal?: (error: unknown) => void;
  }
): Promise<void> =>
  streamSse(`/api/ai/chat/stream/${messageId}`, {
    signal: handlers.signal,
    onEvent: (type, data) => {
      const payload = (data ?? {}) as { text?: string; message?: string };
      if (type === 'chunk') {
        handlers.onChunk?.(payload.text ?? '');
      } else if (type === 'done') {
        handlers.onDone?.();
      } else if (type === 'error') {
        handlers.onError?.(payload.message ?? '生成失败');
      }
    },
    onError: (error) => handlers.onFatal?.(error)
  });

// ---------- 生图 ----------
export const generateImages = (payload: {
  modelId?: number;
  prompt: string;
  size?: string;
  count?: number;
  // 图生图参考图（data URL 数组，≤4 张）：与后端 GenerateImageDto.referenceImages 对齐，
  // 有值时后端适配器自动切 images/edits 通道。
  referenceImages?: string[];
}) => http.post<never, { images: AiImageRecord[] }>('/ai/images/generations', payload, {
  timeout: LONG_TASK_TIMEOUT
});
export const listImageHistory = () => http.get<never, AiImageRecord[]>('/ai/images');

// ---------- 生图画布快照（每用户一行，GET 读 / PUT 幂等覆盖） ----------
export interface AiCanvasVo {
  snapshot: Record<string, unknown> | null;
}

export const loadCanvas = () => http.get<never, AiCanvasVo>('/ai/canvas');

// 快照结构 { version: 1, nodes, viewport }（serialize 白名单纯数据），2MB 上限由后端校验。
// 参数用 object 宽类型：快照结构契约由 components/canvas/canvas.helpers 定义，api 层不耦合。
export const saveCanvas = (snapshot: object) =>
  http.put<never, { success: boolean }>('/ai/canvas', { snapshot });

// 页面卸载/切页时的最后一次画布保存：axios(XHR) 在 pagehide / 组件卸载期会被浏览器取消，
// 改用原生 fetch keepalive——请求一旦发出即由浏览器保证尽力投递（同源 PUT+JSON，与 axios
// baseURL '/api' 同构；响应不等待不解析）。鉴权头手动带上（原生 fetch 不走 axios 拦截器）。
// 依赖 components/canvas/canvasAutosave 的纯函数做请求体预算（api→components 单向、
// 该文件零 import 无环；快照契约同在 components/canvas，与页面层各自单向引用不耦合）。
export const saveCanvasKeepalive = (snapshot: object): void => {
  const body = canvasKeepaliveBody(snapshot);
  if (!body) {
    return; // 超 keepalive 64KB 预算：放弃 flush（防抖保存已兜底，flush 只兜增量窗口）
  }
  const token = store.getState().auth.accessToken;
  void fetch('/api/ai/canvas', {
    method: 'PUT',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body
  }).catch(() => {
    // 卸载期 flush 失败无下一次机会：静默；下次进入画布以服务器快照为准。
  });
};
