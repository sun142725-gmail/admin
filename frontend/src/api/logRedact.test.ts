import { describe, expect, it } from 'vitest';
// logRedact 纯模块单测：credentials 敏感键增补（发布矩阵凭据脱敏回归）、data URL 占位、截断、递归。
import { MAX_CAPTURE_CHARS, redactValue, redactHeaders } from './logRedact';

describe('redactValue（日志脱敏纯函数）', () => {
  it('credentials 命中敏感键：值替换为 ***（发布矩阵凭据泄漏回归）', () => {
    expect(redactValue('credentials', 'sk-secret-1234567890')).toBe('***');
    expect(redactValue('body', { platform: 'douyin', credentials: 'sk-secret' })).toEqual({
      platform: 'douyin',
      credentials: '***'
    });
  });

  it('既有敏感键不回归：password/accessToken 等仍脱敏', () => {
    expect(redactValue('password', 'plain')).toBe('***');
    expect(redactValue('accessToken', 'jwt')).toBe('***');
  });

  it('data URL 音视频/图片：只留占位', () => {
    expect(redactValue('body', 'data:image/png;base64,AAAA')).toBe('[base64 26 字符已省略]');
    expect(redactValue('body', 'data:audio/mpeg;base64,AAAA')).toBe('[base64 27 字符已省略]');
  });

  it('普通字符串：仅截断不脱敏', () => {
    const long = 'a'.repeat(MAX_CAPTURE_CHARS + 10);
    expect(redactValue('body', long)).toBe(`a${'a'.repeat(999)}…[截断，原长 ${long.length}]`);
  });

  it('数组与嵌套对象：递归脱敏', () => {
    expect(redactValue('body', [{ credentials: 'x' }, { nested: { password: 'y' } }])).toEqual([
      { credentials: '***' },
      { nested: { password: '***' } }
    ]);
  });
});

describe('redactHeaders（敏感头脱敏）', () => {
  it('authorization/cookie 头替换为 ***，其余透传', () => {
    expect(redactHeaders({ Authorization: 'Bearer x', 'Content-Type': 'application/json' })).toEqual({
      Authorization: '***',
      'Content-Type': 'application/json'
    });
  });
});
