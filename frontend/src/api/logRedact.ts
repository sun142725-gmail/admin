// 日志脱敏纯模块：从 api/http.ts 抽出（http.ts 连带 axios/store 有副作用，纯模块才能离线单测）。
// 2026-10-31：增补敏感键 credentials（发布矩阵账号凭据），堵住业务失败/慢请求/HTTP 错误
// 三条日志路径经 buildRequestCapture 携带明文凭据落 log-center 的泄漏（log-center 后端无二次脱敏）。
export const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-refresh-token'
]);

export const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'oldPassword',
  'newPassword',
  'confirmPassword',
  'refreshToken',
  'accessToken',
  'verifyCode',
  'verificationCode',
  'credentials'
]);

// 单字段捕获截断：与 logBatcher 的 meta 预算配合（服务端单事件上限 4000 字符）
export const MAX_CAPTURE_CHARS = 1000;
// 大数组折叠阈值：列表接口响应整体序列化截断由 logBatcher 兜底，这里先控制条目数
export const MAX_CAPTURE_ARRAY = 30;

export const truncateText = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}…[截断，原长 ${value.length}]` : value;

// 递归脱敏+截断：key 命中敏感词替换值；字符串超长截断；base64 图片/音频/视频只留占位
export const redactValue = (key: string, value: unknown): unknown => {
  if (SENSITIVE_BODY_KEYS.has(key)) {
    return '***';
  }
  if (typeof value === 'string') {
    if (/^data:(image|audio|video)\//.test(value)) {
      return `[base64 ${value.length} 字符已省略]`;
    }
    return truncateText(value, MAX_CAPTURE_CHARS);
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_CAPTURE_ARRAY) {
      return `[Array(${value.length})]`;
    }
    return value.map((item) => redactValue(key, item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      out[childKey] = redactValue(childKey, childValue);
    });
    return out;
  }
  return value;
};

export const redactHeaders = (headers: unknown): Record<string, unknown> | undefined => {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  Object.entries(headers as Record<string, unknown>).forEach(([key, value]) => {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '***' : redactValue(key, value);
  });
  return out;
};
