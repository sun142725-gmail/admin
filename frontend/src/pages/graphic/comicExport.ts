// 漫画长图导出：布局数据（comicLayout.ts）→ canvas 绘制 → PNG 长图下载。
// 绘制规则抽成可注入 ctx 的 drawComicPage（mock ctx 单测覆盖），文件只把
// 「建 canvas / 加载图片 / toBlob / 触发下载」留成薄 IO（AGENTS 规则 4：逻辑与网络/DOM 分离）。
import type { ComicLayout, ComicPage } from './comicLayout';

export const COMIC_FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", -apple-system, sans-serif';
const COLOR = {
  page: '#ffffff',
  gutter: '#e5e7eb',
  panelPlaceholder: '#f3f4f6',
  border: '#1f2937',
  bubble: 'rgba(255, 255, 255, 0.94)',
  text: '#111827',
  muted: '#9ca3af',
  footer: '#6b7280'
};

// 只声明实际用到的 ctx 成员，便于测试注入 mock（真实 CanvasRenderingContext2D 可直接赋值）。
export interface ComicDrawContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
}

export interface ComicLoadedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
}

export interface ComicDrawOptions {
  images?: Map<number, ComicLoadedImage>;
  /** 该页在长图画布上的纵向偏移。 */
  offsetY?: number;
  totalPages?: number;
  fontFamily?: string;
}

/** object-fit: cover 的等价裁剪：等比放大到铺满目标格后居中裁切。零尺寸返回 null。 */
export const coverCrop = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): { sx: number; sy: number; sw: number; sh: number } | null => {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return null;
  }
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const sw = targetWidth / scale;
  const sh = targetHeight / scale;
  return { sx: (sourceWidth - sw) / 2, sy: (sourceHeight - sh) / 2, sw, sh };
};

/** 安全文件名：去掉路径分隔符与控制字符，空格折成连字符，空标题兜底。 */
export const comicFileName = (title: string, pageCount: number): string => {
  const base = (title ?? '')
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'comic'}-${Math.max(0, pageCount)}p.png`;
};

/** 绘制单页（纯绘制逻辑，ctx 由调用方注入）。 */
export const drawComicPage = (ctx: ComicDrawContext, page: ComicPage, options: ComicDrawOptions = {}): void => {
  const images = options.images ?? new Map<number, ComicLoadedImage>();
  const offsetY = options.offsetY ?? 0;
  const totalPages = options.totalPages ?? page.pageIndex + 1;
  const fontFamily = options.fontFamily ?? COMIC_FONT_FAMILY;

  ctx.fillStyle = COLOR.page;
  ctx.fillRect(0, offsetY, page.width, page.height);

  for (const panel of page.panels) {
    const x = panel.x;
    const y = panel.y + offsetY;
    ctx.fillStyle = COLOR.panelPlaceholder;
    ctx.fillRect(x, y, panel.width, panel.height);

    const image = images.get(panel.sceneId);
    const crop = image ? coverCrop(image.width, image.height, panel.width, panel.height) : null;
    if (image && crop) {
      ctx.drawImage(image.source, crop.sx, crop.sy, crop.sw, crop.sh, x, y, panel.width, panel.height);
    } else {
      ctx.fillStyle = COLOR.muted;
      ctx.font = `14px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('待生成', x + panel.width / 2, y + panel.height / 2);
    }

    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, panel.width, panel.height);

    const bubble = panel.bubble;
    if (bubble) {
      const bubbleY = bubble.y + offsetY;
      ctx.fillStyle = COLOR.bubble;
      ctx.fillRect(bubble.x, bubbleY, bubble.width, bubble.height);
      ctx.strokeStyle = COLOR.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bubble.x, bubbleY, bubble.width, bubble.height);
      ctx.fillStyle = COLOR.text;
      ctx.font = `${bubble.fontSize}px ${fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      bubble.lines.forEach((line, index) => {
        ctx.fillText(line, bubble.x + bubble.padding, bubbleY + bubble.padding + index * bubble.lineHeight);
      });
    }
  }

  ctx.fillStyle = COLOR.footer;
  ctx.font = `12px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${page.pageIndex + 1} / ${totalPages}`, page.width / 2, offsetY + page.height - 17);
};

/** 按 sceneId 并发预加载幕图；单张失败不阻断导出（该格画占位）。同源 /uploads 不会污染画布。 */
export const loadComicImages = async (
  pages: readonly ComicPage[]
): Promise<Map<number, ComicLoadedImage>> => {
  const result = new Map<number, ComicLoadedImage>();
  const jobs: Promise<void>[] = [];
  for (const page of pages) {
    for (const panel of page.panels) {
      if (!panel.imageUrl || result.has(panel.sceneId)) {
        continue;
      }
      const url = panel.imageUrl;
      jobs.push(
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              result.set(panel.sceneId, {
                width: img.naturalWidth,
                height: img.naturalHeight,
                source: img
              });
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        })
      );
    }
  }
  await Promise.all(jobs);
  return result;
};

export interface ComicRenderResult {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
}

/**
 * 薄 IO：把整本漫画按页纵向拼成一张长图并触发下载。
 * 绘制规则全在 drawComicPage，这里只负责 canvas / 图片 / toBlob / a[download]。
 */
export const renderComicPng = async (layout: ComicLayout, title: string): Promise<ComicRenderResult> => {
  if (layout.pages.length === 0) {
    throw new Error('没有可导出的漫画页，请先生成幕图');
  }
  const canvas = document.createElement('canvas');
  canvas.width = layout.pageWidth;
  canvas.height = layout.totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('当前浏览器不支持 canvas 2d');
  }
  ctx.fillStyle = COLOR.gutter;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const images = await loadComicImages(layout.pages);
  layout.pages.forEach((page) => {
    const offsetY = page.pageIndex * (layout.pageHeight + layout.pageGap);
    drawComicPage(ctx, page, { images, offsetY, totalPages: layout.pages.length });
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG 导出失败'))), 'image/png');
  });
  const fileName = comicFileName(title, layout.pages.length);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 立即回收会让部分浏览器取消下载，延后一拍释放。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { blob, fileName, width: canvas.width, height: canvas.height };
};
