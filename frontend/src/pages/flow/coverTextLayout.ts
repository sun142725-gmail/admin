// 封面文字布局纯函数：标题/副标题按注入的 measureText 逐字符累计宽度折行，
// 输出每行 { text, x, y, fontSize, role }（y 为 textBaseline='top' 语义的行顶坐标）。
// measureText 由调用方注入：浏览器侧传与真实绘制同字体族的 canvas ctx.measureText
// （折行估算与绘制同源），测试传假函数——不硬依赖 canvas（AGENTS 规则 4）。

export type CoverTextRole = 'title' | 'subtitle';
export type CoverTextPosition = 'top' | 'bottom';

export interface CoverTextLine {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  role: CoverTextRole;
}

export interface CoverLayoutInput {
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  position: CoverTextPosition;
  titleFontSize: number;
  subtitleFontSize: number;
  // 返回该文本在给定字号下的宽度（与真实绘制同字体族）。
  measureText: (text: string, fontSize: number) => number;
}

export interface CoverLayoutOptions {
  // 行高倍数 / 画布水平安全边距比例 / 标题与副标题间距（相对标题字号），缺省即生产值。
  lineHeightRatio?: number;
  paddingRatio?: number;
  gapRatio?: number;
}

/** 逐字符累计宽度折行：单字符超宽时也保留（不产生空行）；返回折行后的行文本数组。 */
export const wrapCoverText = (
  text: string,
  fontSize: number,
  maxWidth: number,
  measureText: (text: string, fontSize: number) => number
): string[] => {
  const source = (text ?? '').trim();
  if (!source) {
    return [];
  }
  const lines: string[] = [];
  let current = '';
  for (const char of source) {
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
  return lines;
};

/**
 * 计算封面文字布局：文字水平居中，整块按 position 贴顶/贴底安全边距。
 * 标题为空时不输出标题行（副标题仍渲染）；两者皆空返回空数组。
 */
export const computeCoverLayout = (input: CoverLayoutInput, options: CoverLayoutOptions = {}): CoverTextLine[] => {
  const lineHeightRatio = options.lineHeightRatio ?? 1.3;
  const paddingRatio = options.paddingRatio ?? 0.06;
  const gapRatio = options.gapRatio ?? 0.35;
  const padding = input.width * paddingRatio;
  const maxWidth = Math.max(input.width - padding * 2, 0);

  const titleLines = wrapCoverText(input.title, input.titleFontSize, maxWidth, input.measureText);
  const subtitleLines = wrapCoverText(
    input.subtitle ?? '',
    input.subtitleFontSize,
    maxWidth,
    input.measureText
  );
  if (titleLines.length === 0 && subtitleLines.length === 0) {
    return [];
  }

  const titleLineHeight = input.titleFontSize * lineHeightRatio;
  const subtitleLineHeight = input.subtitleFontSize * lineHeightRatio;
  const gap = input.titleFontSize * gapRatio;
  const blockHeight =
    titleLines.length * titleLineHeight + (subtitleLines.length > 0 ? gap + subtitleLines.length * subtitleLineHeight : 0);
  const startY = input.position === 'top' ? padding : input.height - padding - blockHeight;

  // 水平居中：x = (width - 行宽) / 2，行宽超出安全区时 clamp 到左安全边距。
  const centeredX = (text: string, fontSize: number): number => {
    const lineWidth = input.measureText(text, fontSize);
    return Math.max(padding, (input.width - lineWidth) / 2);
  };

  const lines: CoverTextLine[] = [];
  let cursorY = startY;
  for (const text of titleLines) {
    lines.push({ text, x: centeredX(text, input.titleFontSize), y: cursorY, fontSize: input.titleFontSize, role: 'title' });
    cursorY += titleLineHeight;
  }
  if (subtitleLines.length > 0) {
    cursorY += gap;
    for (const text of subtitleLines) {
      lines.push({
        text,
        x: centeredX(text, input.subtitleFontSize),
        y: cursorY,
        fontSize: input.subtitleFontSize,
        role: 'subtitle'
      });
      cursorY += subtitleLineHeight;
    }
  }
  return lines;
};
