// 占卜 API 封装。
import http from './http';
import { streamSse } from './sse';
import type {
  DivinationListResult,
  DivinationRecord,
  DivinationSummary
} from '../pages/divination/types';

export const createDivination = async (): Promise<DivinationRecord> =>
  http.post('/divinations', {});

export const getDivination = async (id: number): Promise<DivinationRecord> =>
  http.get(`/divinations/${id}`);

// 补填主题（成卦后、解卦前）。
export const setTopicDivination = async (id: number, topic: string): Promise<DivinationRecord> =>
  http.patch(`/divinations/${id}/topic`, { topic });

export const listDivinations = async (page = 1, pageSize = 20): Promise<DivinationListResult> =>
  http.get('/divinations', { params: { page, pageSize } });

export const reinterpretDivination = async (
  id: number
): Promise<{ success: boolean; needsTopic?: boolean }> =>
  http.post(`/divinations/${id}/reinterpret`);

export const removeDivination = async (id: number): Promise<{ success: boolean }> =>
  http.delete(`/divinations/${id}`);

export interface InterpretationStreamHandlers {
  onChunk?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  onFatal?: (error: unknown) => void;
}

// 订阅解卦 SSE 流：chunk 增量文本 / done 完成 / error 业务失败。
export const streamInterpretation = (
  id: number,
  signal: AbortSignal,
  handlers: InterpretationStreamHandlers
): Promise<void> =>
  streamSse(`/api/divinations/${id}/interpretation/stream`, {
    signal,
    onEvent: (type, data) => {
      const payload = (data ?? {}) as { text?: string; message?: string };
      if (type === 'chunk') {
        handlers.onChunk?.(payload.text ?? '');
      } else if (type === 'done') {
        handlers.onDone?.();
      } else if (type === 'error') {
        handlers.onError?.(payload.message ?? '解读暂不可用');
      }
    },
    onError: (error) => handlers.onFatal?.(error)
  });

export type { DivinationSummary };
