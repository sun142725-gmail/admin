// 封面文字布局纯函数单测：measureText 注入假函数（等宽近似），不依赖 canvas。
import { describe, expect, it } from 'vitest';
import { computeCoverLayout, wrapCoverText } from './coverTextLayout';

// 等宽假测量：每字符宽度 = fontSize（中文/英文同宽近似，够验折行与坐标逻辑）。
const monoMeasure = (text: string, fontSize: number) => text.length * fontSize;

const layout = (overrides: Partial<Parameters<typeof computeCoverLayout>[0]> = {}) =>
  computeCoverLayout({
    title: '雪夜',
    subtitle: undefined,
    width: 1000,
    height: 1600,
    position: 'bottom',
    titleFontSize: 100,
    subtitleFontSize: 48,
    measureText: monoMeasure,
    ...overrides
  });

describe('wrapCoverText', () => {
  it('短文本不折行', () => {
    expect(wrapCoverText('雪夜独行', 100, 880, monoMeasure)).toEqual(['雪夜独行']);
  });

  it('超宽逐字符折行（ maxWidth=880，字号 100 → 每行 8 字符）', () => {
    expect(wrapCoverText('一二三四五六七八九十', 100, 880, monoMeasure)).toEqual(['一二三四五六七八', '九十']);
  });

  it('单个字符超宽也保留（不产生空行）', () => {
    expect(wrapCoverText('宽', 1000, 100, monoMeasure)).toEqual(['宽']);
  });

  it('空文本/纯空白返回空数组', () => {
    expect(wrapCoverText('', 100, 880, monoMeasure)).toEqual([]);
    expect(wrapCoverText('   ', 100, 880, monoMeasure)).toEqual([]);
  });
});

describe('computeCoverLayout', () => {
  it('中文短标题不折行，单行水平居中', () => {
    const lines = layout({ title: '雪夜独行' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ text: '雪夜独行', role: 'title', fontSize: 100 });
    // x = (1000 - 400) / 2 = 300
    expect(lines[0].x).toBe(300);
  });

  it('position=bottom：块贴底，末行底部 = height - padding', () => {
    const lines = layout({ title: '雪夜独行' });
    // padding = 1000*0.06 = 60；块高 = 1*130；首行 y = 1600-60-130 = 1410
    expect(lines[0].y).toBe(1410);
    // 末行行底 = y + lineHeight = 1540 = height - padding
    expect(lines[0].y + 130).toBe(1540);
  });

  it('position=top：块贴顶，首行 y = padding', () => {
    const lines = layout({ title: '雪夜独行', position: 'top' });
    expect(lines[0].y).toBe(60);
  });

  it('标题超宽折行后逐行坐标递增行高', () => {
    const lines = layout({ title: '一二三四五六七八九十', position: 'top' });
    expect(lines.map((line) => line.text)).toEqual(['一二三四五六七八', '九十']);
    expect(lines[0].y).toBe(60);
    expect(lines[1].y).toBe(60 + 130);
  });

  it('副标题缺省 → 只有标题行；标题空但副标题有值 → 只有副标题行', () => {
    const titleOnly = layout({ title: '雪夜独行', subtitle: undefined });
    expect(titleOnly.every((line) => line.role === 'title')).toBe(true);

    const subtitleOnly = layout({ title: '', subtitle: '第一章 雪夜' });
    expect(subtitleOnly).toHaveLength(1);
    expect(subtitleOnly[0].role).toBe('subtitle');
    expect(subtitleOnly[0].fontSize).toBe(48);
  });

  it('标题+副标题：块高含标题行、间距与副标题行，bottom 贴底对齐', () => {
    const lines = layout({ title: '雪夜独行', subtitle: '第一章', position: 'bottom' });
    expect(lines).toHaveLength(2);
    // blockHeight = 130 + (100*0.35) + 62.4 = 227.4；标题行 y = 1600-60-227.4 = 1312.6
    expect(lines[0].y).toBeCloseTo(1312.6, 5);
    // 副标题行 y = 标题行 y + 130 + 35 = 1477.6；末行行底 = 1540 = height - padding
    expect(lines[1].y).toBeCloseTo(1477.6, 5);
    expect(lines[1].y + 62.4).toBeCloseTo(1540, 5);
  });

  it('中英混排按累计宽度折行', () => {
    // maxWidth=880，字号 50 → 每字符 50 → 17 字符/行
    const lines = layout({ title: 'StarNight星际之夜第一章雪夜独行', titleFontSize: 50, position: 'top' });
    expect(lines.map((line) => line.text)).toEqual(['StarNight星际之夜第一章雪', '夜独行']);
  });

  it('标题与副标题均空返回空行数组', () => {
    expect(layout({ title: '', subtitle: '' })).toEqual([]);
    expect(layout({ title: '   ' })).toEqual([]);
  });
});
