// 行情数据源 HTTP 工具：统一超时、GBK 解码与 JSONP 剥离。
// 腾讯/新浪返回 GBK 编码，需按 GBK 解码（Node 20 内置全量 ICU）。

const FETCH_TIMEOUT_MS = 8000;

export async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`行情接口返回 ${response.status}`);
  }
  return response.text();
}

export async function fetchGbk(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`行情接口返回 ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new TextDecoder('gbk').decode(buffer);
}

export async function fetchJson<T>(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<T> {
  let text: string;
  if (init?.method) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`接口返回 ${response.status}`);
    }
    text = await response.text();
  } else {
    text = await fetchText(url);
  }
  // 部分接口（如东财 suggest）会返回 jQuery...( {...} ) 的 JSONP 包装，剥离后解析。
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start =
    firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;
  const endBrace = text.lastIndexOf('}');
  const endBracket = text.lastIndexOf(']');
  const end = endBrace > endBracket ? endBrace : endBracket;
  if (start >= 0 && end > start && (start > 0 || end < text.length - 1)) {
    text = text.slice(start, end + 1);
  }
  return JSON.parse(text) as T;
}
