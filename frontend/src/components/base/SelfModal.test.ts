// resolveModalWidth 纯函数单测：档位解析与 number|string 透传。
import { describe, expect, it } from 'vitest';
import { resolveModalWidth } from './SelfModal';

describe('resolveModalWidth', () => {
  it('缺省为 sm=520', () => {
    expect(resolveModalWidth(undefined)).toBe(520);
  });

  it('三档刻度', () => {
    expect(resolveModalWidth('sm')).toBe(520);
    expect(resolveModalWidth('md')).toBe(640);
    expect(resolveModalWidth('lg')).toBe(720);
  });

  it('number/string 透传', () => {
    expect(resolveModalWidth(760)).toBe(760);
    expect(resolveModalWidth('80vw')).toBe('80vw');
  });
});
