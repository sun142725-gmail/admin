// getErrorMessage 纯函数单测：口径对齐 api/http.ts:209-210 与两份私有副本（HomePage.tsx:212-224）。
import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errorMessage';

describe('getErrorMessage', () => {
  it('axios response.data.message 优先', () => {
    const error = { response: { data: { message: '来源响应错误' } } };
    expect(getErrorMessage(error, '兜底')).toBe('来源响应错误');
  });

  it('Error.message 次之（http.ts reject 的 new Error(payload?.message) 形态）', () => {
    expect(getErrorMessage(new Error('请求失败: 403'), '兜底')).toBe('请求失败: 403');
    expect(getErrorMessage({ message: '对象 message' }, '兜底')).toBe('对象 message');
  });

  it('response.message 存在但为空串时回退 Error.message（truthy 校验）', () => {
    expect(getErrorMessage({ response: { data: { message: '' } }, message: '直取文案' }, '兜底')).toBe('直取文案');
  });

  it('普通对象/空对象/基础类型返回 fallback', () => {
    expect(getErrorMessage({}, '兜底')).toBe('兜底');
    expect(getErrorMessage(null, '兜底')).toBe('兜底');
    expect(getErrorMessage(undefined, '兜底')).toBe('兜底');
    expect(getErrorMessage('字符串错误', '兜底')).toBe('兜底');
    expect(getErrorMessage(42, '兜底')).toBe('兜底');
  });

  it('空 message 字段不作为有效文案', () => {
    expect(getErrorMessage({ message: '' }, '兜底')).toBe('兜底');
  });
});
