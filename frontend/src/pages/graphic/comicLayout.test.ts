// 漫画分格排版纯函数单测（vitest，无 DOM 依赖：measureText 注入假函数）。
import { describe, expect, it } from 'vitest';
import {
  COMIC_DEFAULTS,
  COMIC_PRESETS,
  estimateComicTextWidth,
  layoutComic,
  truncateComicLines,
  wrapComicText
} from './comicLayout';
import type { ComicSceneInput } from './comicLayout';

const measure = (text: string, fontSize: number) => [...text].length * fontSize;

const scene = (idx: number, overrides: Partial<ComicSceneInput> = {}): ComicSceneInput => ({
  id: 100 + idx,
  idx,
  name: `幕 ${idx}`,
  content: `第 ${idx} 幕的画面描述`,
  imageUrl: `/uploads/graphic/scene-${idx}.png`,
  ...overrides
});

const scenes = (count: number) => Array.from({ length: count }, (_, i) => scene(i + 1));

describe('wrapComicText', () => {
  it('空文本或零宽度返回空数组', () => {
    expect(wrapComicText('', 15, 200, measure)).toEqual([]);
    expect(wrapComicText('   ', 15, 200, measure)).toEqual([]);
    expect(wrapComicText('有内容', 15, 0, measure)).toEqual([]);
  });

  it('按注入的 measureText 逐字符折行', () => {
    expect(wrapComicText('一二三四五', 10, 30, measure)).toEqual(['一二三', '四五']);
  });

  it('支持显式换行并跳过空段落', () => {
    expect(wrapComicText('第一行\n\n第二行', 10, 100, measure)).toEqual(['第一行', '第二行']);
  });

  it('单字符超宽时仍保留该字符，不产生空行', () => {
    expect(wrapComicText('甲乙', 100, 10, measure)).toEqual(['甲', '乙']);
  });

  it('不注入 measureText 时用 CJK 全宽估算', () => {
    expect(estimateComicTextWidth('中文', 10)).toBe(20);
    expect(estimateComicTextWidth('ab', 10)).toBeCloseTo(11);
  });
});

describe('truncateComicLines', () => {
  it('未超限原样返回（新数组）', () => {
    const lines = ['甲', '乙'];
    const out = truncateComicLines(lines, 3);
    expect(out).toEqual(lines);
    expect(out).not.toBe(lines);
  });

  it('超限时保留前 N 行并在末行追加省略号', () => {
    expect(truncateComicLines(['甲', '乙', '丙', '丁'], 2)).toEqual(['甲', '乙…']);
  });

  it('行数上限 <= 0 返回空', () => {
    expect(truncateComicLines(['甲'], 0)).toEqual([]);
  });
});

describe('layoutComic 分页与格位', () => {
  it('空幕列表返回零页零高度', () => {
    const layout = layoutComic([]);
    expect(layout.pages).toEqual([]);
    expect(layout.panelCount).toBe(0);
    expect(layout.totalHeight).toBe(0);
  });

  it('四格模板：4 幕一页，格位按 2×2 排列', () => {
    const layout = layoutComic(scenes(4), { preset: 'quad', measureText: measure });
    expect(layout.pages).toHaveLength(1);
    expect(layout.panelCount).toBe(4);
    expect(layout.pageWidth).toBe(800);
    // contentWidth=752 → (752-12)/2=370；panelHeight=370；pageHeight=752+48+34=834
    expect(layout.pageHeight).toBe(834);
    expect(layout.pages[0].panels.map((p) => [p.x, p.y, p.width, p.height])).toEqual([
      [24, 24, 370, 370],
      [406, 24, 370, 370],
      [24, 406, 370, 370],
      [406, 406, 370, 370]
    ]);
  });

  it('末尾不足一页留白，不补占位格', () => {
    const layout = layoutComic(scenes(5), { preset: 'quad', measureText: measure });
    expect(layout.pages.map((p) => p.pageIndex)).toEqual([0, 1]);
    expect(layout.pages.map((p) => p.panels.length)).toEqual([4, 1]);
    expect(layout.totalHeight).toBe(2 * layout.pageHeight + COMIC_DEFAULTS.pageGap);
  });

  it('单格 / 双格模板按每页格数分页', () => {
    expect(layoutComic(scenes(3), { preset: 'single' }).pages.map((p) => p.panels.length)).toEqual([1, 1, 1]);
    expect(layoutComic(scenes(3), { preset: 'double' }).pages.map((p) => p.panels.length)).toEqual([2, 1]);
  });

  it('预设声明的每页格数与实际分页一致', () => {
    COMIC_PRESETS.forEach((preset) => {
      const layout = layoutComic(scenes(preset.panelsPerPage), { preset: preset.value });
      expect(layout.pages).toHaveLength(1);
      expect(layout.pages[0].panels).toHaveLength(preset.panelsPerPage);
    });
  });

  it('按 idx 排序，乱序输入也保持阅读顺序', () => {
    const layout = layoutComic([scene(3), scene(1), scene(2)], { preset: 'single' });
    expect(layout.pages.map((p) => p.panels[0].idx)).toEqual([1, 2, 3]);
  });
});

describe('layoutComic 气泡与格位内容', () => {
  it('默认生成气泡，且气泡完全落在格子内部', () => {
    const layout = layoutComic(scenes(2), { preset: 'double', measureText: measure });
    const panel = layout.pages[0].panels[0];
    expect(panel.bubble).not.toBeNull();
    const bubble = panel.bubble!;
    expect(bubble.x).toBeGreaterThanOrEqual(panel.x);
    expect(bubble.y).toBeGreaterThanOrEqual(panel.y);
    expect(bubble.x + bubble.width).toBeLessThanOrEqual(panel.x + panel.width);
    expect(bubble.y + bubble.height).toBeLessThanOrEqual(panel.y + panel.height);
    expect(bubble.lines.join('')).toContain('第 1 幕');
  });

  it('关闭气泡时所有格子都不带气泡', () => {
    const layout = layoutComic(scenes(2), { showBubble: false });
    expect(layout.pages[0].panels.every((p) => p.bubble === null)).toBe(true);
  });

  it('空文案不生成气泡', () => {
    const layout = layoutComic([scene(1, { content: '   ' })], { measureText: measure });
    expect(layout.pages[0].panels[0].bubble).toBeNull();
  });

  it('长文案按 maxBubbleLines 截断，气泡高度随行数变化', () => {
    const long = '这是一段非常长的画面描述文字用来验证气泡折行与截断逻辑是否按预期工作'.repeat(3);
    const layout = layoutComic([scene(1, { content: long })], {
      measureText: measure,
      maxBubbleLines: 2
    });
    const bubble = layout.pages[0].panels[0].bubble!;
    expect(bubble.lines).toHaveLength(2);
    expect(bubble.lines[1].endsWith('…')).toBe(true);
    expect(bubble.height).toBe(2 * bubble.lineHeight + bubble.padding * 2);
  });

  it('注入的 measureText 影响折行结果', () => {
    const oneCharPerLine = layoutComic([scene(1, { content: '甲乙丙' })], {
      measureText: (text, fontSize) => text.length * fontSize * 10
    });
    expect(oneCharPerLine.pages[0].panels[0].bubble!.lines.length).toBeGreaterThan(1);
  });

  it('缺图幕保留格位并标记 imageUrl 为空', () => {
    const layout = layoutComic([scene(1, { imageUrl: null })], { measureText: measure });
    expect(layout.pages[0].panels).toHaveLength(1);
    expect(layout.pages[0].panels[0].imageUrl).toBeNull();
  });

  it('自定义页宽 / 内边距 / 间距按比例生效', () => {
    const layout = layoutComic(scenes(1), { preset: 'single', pageWidth: 400, padding: 10, gap: 8 });
    expect(layout.pages[0].panels[0].width).toBe(380);
    expect(layout.pages[0].panels[0].x).toBe(10);
  });
});
