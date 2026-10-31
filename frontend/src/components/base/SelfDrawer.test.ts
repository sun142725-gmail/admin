// resolveDrawerWidth 纯函数单测：档位解析与 number|string 透传（含 '66vw'/min() 响应式合法值）。
import { describe, expect, it } from 'vitest';
import { resolveDrawerWidth } from './SelfDrawer';

describe('resolveDrawerWidth', () => {
  it('缺省为 md=560（贴现状最大簇，变更面最小）', () => {
    expect(resolveDrawerWidth(undefined)).toBe(560);
  });

  it('三档刻度', () => {
    expect(resolveDrawerWidth('sm')).toBe(480);
    expect(resolveDrawerWidth('md')).toBe(560);
    expect(resolveDrawerWidth('lg')).toBe(720);
  });

  it('number 透传', () => {
    expect(resolveDrawerWidth(860)).toBe(860);
    expect(resolveDrawerWidth(900)).toBe(900);
  });

  it("string 透传保留响应式合法值（'66vw'、min() 写法）", () => {
    expect(resolveDrawerWidth('66vw')).toBe('66vw');
    expect(resolveDrawerWidth('min(92vw, 360px)')).toBe('min(92vw, 360px)');
  });
});
