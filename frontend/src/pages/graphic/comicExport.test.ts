// 漫画 canvas 绘制规则单测：ctx 用 mock 注入，不依赖 DOM（toBlob/下载属薄 IO，不在测试范围）。
import { describe, expect, it, vi } from 'vitest';
import { comicFileName, coverCrop, drawComicPage } from './comicExport';
import type { ComicDrawContext, ComicLoadedImage } from './comicExport';
import { layoutComic } from './comicLayout';
import type { ComicSceneInput } from './comicLayout';

const makeCtx = () => ({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn()
});

const scene = (idx: number, overrides: Partial<ComicSceneInput> = {}): ComicSceneInput => ({
  id: 200 + idx,
  idx,
  name: `幕 ${idx}`,
  content: `第 ${idx} 幕的画面描述`,
  imageUrl: `/uploads/graphic/scene-${idx}.png`,
  ...overrides
});

const fakeImage = (): ComicLoadedImage => ({
  width: 1024,
  height: 1024,
  source: {} as CanvasImageSource
});

describe('coverCrop', () => {
  it('宽图居中裁左右', () => {
    expect(coverCrop(200, 100, 100, 100)).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100 });
  });

  it('高图居中裁上下', () => {
    expect(coverCrop(100, 200, 100, 100)).toEqual({ sx: 0, sy: 50, sw: 100, sh: 100 });
  });

  it('同比例不裁切', () => {
    expect(coverCrop(100, 100, 100, 100)).toEqual({ sx: 0, sy: 0, sw: 100, sh: 100 });
  });

  it('任一维为零返回 null，避免除零', () => {
    expect(coverCrop(0, 100, 100, 100)).toBeNull();
    expect(coverCrop(100, 100, 0, 100)).toBeNull();
  });
});

describe('comicFileName', () => {
  it('去掉路径分隔符与空格', () => {
    expect(comicFileName('锦鲤 物语/第一章', 2)).toBe('锦鲤-物语-第一章-2p.png');
  });

  it('空标题兜底', () => {
    expect(comicFileName('   ', 1)).toBe('comic-1p.png');
    expect(comicFileName('///', 0)).toBe('comic-0p.png');
  });

  it('超长标题截断到 40 字', () => {
    const name = comicFileName('漫'.repeat(80), 3);
    expect(name).toBe(`${'漫'.repeat(40)}-3p.png`);
  });
});

describe('drawComicPage', () => {
  it('四格全部有图时逐格绘制并画边框', () => {
    const layout = layoutComic([1, 2, 3, 4].map((idx) => scene(idx)), { preset: 'quad' });
    const images = new Map<number, ComicLoadedImage>(
      layout.pages[0].panels.map((p) => [p.sceneId, fakeImage()])
    );
    const ctx = makeCtx();
    drawComicPage(ctx as unknown as ComicDrawContext, layout.pages[0], { images, totalPages: 1 });

    expect(ctx.drawImage).toHaveBeenCalledTimes(4);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(8); // 4 格边框 + 4 个气泡描边
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('1 / 1', expect.any(Number), expect.any(Number));
  });

  it('缺图格画「待生成」占位而不是 drawImage', () => {
    const layout = layoutComic([scene(1, { imageUrl: null })], { preset: 'single', showBubble: false });
    const ctx = makeCtx();
    drawComicPage(ctx as unknown as ComicDrawContext, layout.pages[0], { totalPages: 1 });

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('待生成', expect.any(Number), expect.any(Number));
  });

  it('气泡按折行结果逐行绘制文字', () => {
    const layout = layoutComic([scene(1, { content: '甲'.repeat(60) })], {
      preset: 'single',
      maxBubbleLines: 2
    });
    const ctx = makeCtx();
    drawComicPage(ctx as unknown as ComicDrawContext, layout.pages[0], {
      images: new Map([[layout.pages[0].panels[0].sceneId, fakeImage()]]),
      totalPages: 1
    });

    const bubbleLines = layout.pages[0].panels[0].bubble!.lines;
    expect(bubbleLines).toHaveLength(2);
    bubbleLines.forEach((line) => {
      expect(ctx.fillText).toHaveBeenCalledWith(line, expect.any(Number), expect.any(Number));
    });
  });

  it('offsetY 让整页在长图上偏移，页码使用自定义总页数', () => {
    const layout = layoutComic([scene(1)], { preset: 'single', showBubble: false });
    const ctx = makeCtx();
    const offsetY = 850;
    drawComicPage(ctx as unknown as ComicDrawContext, layout.pages[0], {
      images: new Map([[layout.pages[0].panels[0].sceneId, fakeImage()]]),
      offsetY,
      totalPages: 3
    });

    const drawCall = ctx.drawImage.mock.calls[0] as number[];
    // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(drawCall[6]).toBe(layout.pages[0].panels[0].y + offsetY);
    expect(ctx.fillText).toHaveBeenCalledWith('1 / 3', expect.any(Number), expect.any(Number));
  });

  it('空页也绘制白底与页码，不抛异常', () => {
    const ctx = makeCtx();
    const emptyPage = { pageIndex: 0, width: 800, height: 834, panels: [] };
    expect(() => drawComicPage(ctx as unknown as ComicDrawContext, emptyPage, { totalPages: 0 })).not.toThrow();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 834);
  });
});
