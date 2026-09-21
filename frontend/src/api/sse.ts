// 基于 fetch 的 SSE 客户端：零依赖，且可携带 Authorization 头（原生 EventSource 不支持自定义头）。
import { store } from '../store';

export interface SseHandlers {
  /** 收到服务端事件。 */
  onEvent?: (type: string, data: unknown) => void;
  /** 连接或流读取失败（主动 abort 不会触发）。 */
  onError?: (error: unknown) => void;
}

const parseEventBlock = (block: string): { type: string; data: string } | null => {
  let type = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      type = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return { type, data: dataLines.join('\n') };
};

/**
 * 建立 SSE 长连接并持续解析事件，直到服务端关闭流或被 abort。
 * 返回的 Promise 在流结束时 resolve，连接失败时 reject 并触发 onError。
 */
export const streamSse = async (
  url: string,
  handlers: SseHandlers & { signal: AbortSignal }
): Promise<void> => {
  const { signal, onEvent, onError } = handlers;
  const token = store.getState().auth.accessToken;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token ?? ''}`,
        Accept: 'text/event-stream'
      },
      signal
    });
  } catch (error) {
    if (!signal.aborted) {
      onError?.(error);
    }
    return;
  }

  if (!response.ok || !response.body) {
    const error = new Error(`SSE 连接失败: ${response.status}`);
    onError?.(error);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');
        const event = parseEventBlock(block);
        if (!event) {
          continue;
        }
        try {
          onEvent?.(event.type, JSON.parse(event.data));
        } catch {
          // 非 JSON data 原样回调。
          onEvent?.(event.type, event.data);
        }
      }
    }
  } catch (error) {
    if (!signal.aborted) {
      onError?.(error);
    }
  }
};
