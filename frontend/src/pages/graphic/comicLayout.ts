// 漫画分格排版纯函数：把「小说生图」产出的一组散幕图，排成可阅读、可导出的分格漫画页。
// 布局与绘制彻底分离：本文件只算坐标与文字折行（不碰 canvas），CSS 预览与 PNG 导出共用同一份结果，
// 保证所见即所得。measureText 由调用方注入（浏览器传 canvas ctx.measureText，测试传假函数）。
// 同 frontend/src/pages/flow/coverTextLayout.ts 的注入式纯函数约定。

export type ComicPreset = 'single' | 'double' | 'quad';

export const COMIC_PRESETS: { value: ComicPreset; label: string; panelsPerPage: number }[] = [
  { value: 'single', label: '单格长条', panelsPerPage: 1 },
  { value: 'double', label: '双格', panelsPerPage: 2 },
  { value: 'quad', label: '四格', panelsPerPage: 4 }
];

export interface ComicSceneInput {
  id: number;
  idx: number;
  name: string;
  content: string;
  imageUrl?: string | null;
}

export interface ComicLayoutOptions {
  preset?: ComicPreset;
  pageWidth?: number;
  padding?: number;
  gap?: number;
  showBubble?: boolean;
  bubbleFontSize?: number;
  maxBubbleLines?: number;
  footerHeight?: number;
  measureText?: (text: string, fontSize: number) => number;
}

export interface ComicBubble {
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  padding: number;
}

export interface ComicPanel {
  sceneId: number;
  idx: number;
  title: string;
  imageUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  bubble: ComicBubble | null;
}

export interface ComicPage {
  pageIndex: number;
  width: number;
  height: number;
  panels: ComicPanel[];
}

export interface ComicLayout {
  pages: ComicPage[];
  pageWidth: number;
  pageHeight: number;
  pageGap: number;
  totalHeight: number;
  panelCount: number;
}

export const COMIC_DEFAULTS = {
  preset: 'quad' as ComicPreset,
  pageWidth: 800,
  padding: 24,
  gap: 12,
  showBubble: true,
  bubbleFontSize: 15,
  maxBubbleLines: 3,
  footerHeight: 34,
  pageGap: 16,
  bubbleInset: 10,
  bubblePadding: 10,
  lineHeightRatio: 1.4
};

// 未注入 measureText 时的估算：CJK 全宽，其余半宽。浏览器侧务必注入真实 ctx.measureText，
// 让折行与绘制同源（coverTextLayout 的既有约定）。
export const estimateComicTextWidth = (text: string, fontSize: number): number =>
  [...(text ?? '')].reduce((width, char) => {
    const isWide = /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(char);
    return width + (isWide ? fontSize : fontSize * 0.55);
  }, 0);

/** 逐字符折行，支持显式换行；单字符超宽时仍保留该字符，不产生空行。 */
export const wrapComicText = (
  text: string,
  fontSize: number,
  maxWidth: number,
  measureText: (text: string, fontSize: number) => number = estimateComicTextWidth
): string[] => {
  const source = (text ?? '').replace(/\r/g, '').trim();
  if (!source || maxWidth <= 0) {
    return [];
  }
  const lines: string[] = [];
  for (const rawParagraph of source.split('\n')) {
    const paragraph = rawParagraph.trim();
    if (!paragraph) {
      continue;
    }
    let current = '';
    for (const char of paragraph) {
      const candidate = current + char;
      if (current && measureText(candidate, fontSize) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines;
};

/** 超出行数时截断并在末行标记省略，避免长文案把整格盖住。 */
export const truncateComicLines = (lines: string[], maxLines: number, ellipsis = '…'): string[] => {
  if (maxLines <= 0) {
    return [];
  }
  if (lines.length <= maxLines) {
    return [...lines];
  }
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]}${ellipsis}`;
  return kept;
};

const PRESET_GRID: Record<ComicPreset, { cols: number; rows: number; panelRatio: number }> = {
  single: { cols: 1, rows: 1, panelRatio: 1.25 },
  double: { cols: 2, rows: 1, panelRatio: 1.35 },
  quad: { cols: 2, rows: 2, panelRatio: 1 }
};

const computeBubble = (
  content: string,
  panel: { x: number; y: number; width: number; height: number },
  options: Required<Pick<ComicLayoutOptions, 'bubbleFontSize' | 'maxBubbleLines' | 'measureText'>>
): ComicBubble | null => {
  const inset = COMIC_DEFAULTS.bubbleInset;
  const padding = COMIC_DEFAULTS.bubblePadding;
  const fontSize = options.bubbleFontSize;
  const lineHeight = Math.round(fontSize * COMIC_DEFAULTS.lineHeightRatio);
  const width = panel.width - inset * 2;
  const maxTextWidth = width - padding * 2;
  if (width <= 0 || maxTextWidth <= 0) {
    return null;
  }
  const wrapped = wrapComicText(content, fontSize, maxTextWidth, options.measureText);
  if (wrapped.length === 0) {
    return null;
  }
  const lines = truncateComicLines(wrapped, options.maxBubbleLines);
  const height = lines.length * lineHeight + padding * 2;
  return {
    lines,
    x: panel.x + inset,
    y: panel.y + Math.max(0, panel.height - inset - height),
    width,
    height,
    fontSize,
    lineHeight,
    padding
  };
};

/**
 * 生成漫画分页布局。幕按 idx 顺序排布，末尾不足一页的格位留白（不补占位格）。
 * 没有 imageUrl 的幕仍保留格位，由绘制层画「待生成」占位，方便先看版式。
 */
export const layoutComic = (scenes: readonly ComicSceneInput[], options: ComicLayoutOptions = {}): ComicLayout => {
  const preset = options.preset ?? COMIC_DEFAULTS.preset;
  const pageWidth = options.pageWidth ?? COMIC_DEFAULTS.pageWidth;
  const padding = options.padding ?? COMIC_DEFAULTS.padding;
  const gap = options.gap ?? COMIC_DEFAULTS.gap;
  const showBubble = options.showBubble ?? COMIC_DEFAULTS.showBubble;
  const bubbleFontSize = options.bubbleFontSize ?? COMIC_DEFAULTS.bubbleFontSize;
  const maxBubbleLines = options.maxBubbleLines ?? COMIC_DEFAULTS.maxBubbleLines;
  const footerHeight = options.footerHeight ?? COMIC_DEFAULTS.footerHeight;
  const measureText = options.measureText ?? estimateComicTextWidth;
  const pageGap = COMIC_DEFAULTS.pageGap;

  const grid = PRESET_GRID[preset];
  const contentWidth = Math.max(0, pageWidth - padding * 2);
  const panelWidth = Math.max(0, (contentWidth - (grid.cols - 1) * gap) / grid.cols);
  const panelHeight = Math.max(0, Math.round(panelWidth * grid.panelRatio));
  const contentHeight = grid.rows * panelHeight + (grid.rows - 1) * gap;
  const pageHeight = contentHeight + padding * 2 + footerHeight;
  const perPage = grid.cols * grid.rows;

  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const pages: ComicPage[] = [];
  for (let offset = 0; offset < ordered.length; offset += perPage) {
    const pageScenes = ordered.slice(offset, offset + perPage);
    const panels = pageScenes.map((scene, index) => {
      const col = index % grid.cols;
      const row = Math.floor(index / grid.cols);
      const panel = {
        x: padding + col * (panelWidth + gap),
        y: padding + row * (panelHeight + gap),
        width: panelWidth,
        height: panelHeight
      };
      return {
        sceneId: scene.id,
        idx: scene.idx,
        title: scene.name,
        imageUrl: scene.imageUrl ?? null,
        ...panel,
        bubble: showBubble
          ? computeBubble(scene.content, panel, { bubbleFontSize, maxBubbleLines, measureText })
          : null
      } satisfies ComicPanel;
    });
    pages.push({ pageIndex: pages.length, width: pageWidth, height: pageHeight, panels });
  }

  return {
    pages,
    pageWidth,
    pageHeight,
    pageGap,
    totalHeight: pages.length === 0 ? 0 : pages.length * pageHeight + (pages.length - 1) * pageGap,
    panelCount: ordered.length
  };
};
