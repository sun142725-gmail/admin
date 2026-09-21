// AI 模块 API：模型（端点+密钥一体）/智能体/对话/生图。
import http from './http';
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
  http.post<never, ProbeResultVo>(`/ai/admin/models/${id}/test`);
export const probeModelModels = (id: number) =>
  http.post<never, ProbeResultVo>(`/ai/admin/models/${id}/probe-models`);

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
export const generateImages = (payload: { modelId?: number; prompt: string; size?: string; count?: number }) =>
  http.post<never, { images: AiImageRecord[] }>('/ai/images/generations', payload);
export const listImageHistory = () => http.get<never, AiImageRecord[]>('/ai/images');
