// 角色参考图合并纯函数单测：去重 / 截断到 4 / 空输入 / 过滤空值。
import { describe, expect, it } from 'vitest';
import { mergeReferenceImages, MAX_CHARACTER_REFERENCE_IMAGES } from './characterImages';

describe('mergeReferenceImages', () => {
  it('已有图与新增图合并且去重（保持原顺序）', () => {
    expect(
      mergeReferenceImages(['/uploads/common/a.png', '/uploads/common/b.png'], ['/uploads/common/b.png', '/uploads/common/c.png'])
    ).toEqual(['/uploads/common/a.png', '/uploads/common/b.png', '/uploads/common/c.png']);
  });

  it('超限截断到 4 张', () => {
    const merged = mergeReferenceImages(
      ['/uploads/1.png', '/uploads/2.png'],
      ['/uploads/3.png', '/uploads/4.png', '/uploads/5.png']
    );
    expect(merged).toHaveLength(4);
    expect(merged).toEqual(['/uploads/1.png', '/uploads/2.png', '/uploads/3.png', '/uploads/4.png']);
  });

  it('过滤空串/null/undefined 与纯空白', () => {
    expect(mergeReferenceImages(['/uploads/a.png', null, '  '], [undefined, '', '/uploads/b.png'])).toEqual([
      '/uploads/a.png',
      '/uploads/b.png'
    ]);
  });

  it('空输入返回空数组', () => {
    expect(mergeReferenceImages([], [])).toEqual([]);
    expect(mergeReferenceImages([null, undefined], [''])).toEqual([]);
  });

  it('全空输入返回空数组且 max 可自定义', () => {
    expect(mergeReferenceImages(['/uploads/1.png', '/uploads/2.png'], ['/uploads/3.png'], 2)).toEqual([
      '/uploads/1.png',
      '/uploads/2.png'
    ]);
    expect(MAX_CHARACTER_REFERENCE_IMAGES).toBe(4);
  });
});
