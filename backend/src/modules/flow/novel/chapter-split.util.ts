// 章节切分纯函数：从 novel-pipeline.service 的 splitText 方法原样搬出（shot-prompt.util.ts 的
// 「拆纯函数便于单测」同范式），service 方法一行委托，接口行为零变化。
// 规则：优先按「第X章/回/节」标题行切（≥2 个标题才走章节路径），否则按 ~1200 字在段落边界切；
// 最多返回 50 片；空文本 / 切分结果为空抛 BadRequestException（文案与原实现一致）。
import { BadRequestException } from '@nestjs/common';

export interface ChapterSlice {
  idx: number;
  title: string;
  content: string;
}

export const splitChapterText = (text: string): ChapterSlice[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw new BadRequestException('小说内容为空');
  }
  const pattern = /^(.{0,40}?第[一二三四五六七八九十百千万零\d]+[章回节][^\n]{0,60})$/gm;
  const marks: Array<{ index: number; title: string }> = [];
  for (const match of normalized.matchAll(pattern)) {
    marks.push({ index: match.index ?? 0, title: match[1].trim().slice(0, 120) });
  }
  const slices: Array<{ title: string; content: string }> = [];
  if (marks.length >= 2) {
    for (let i = 0; i < marks.length; i += 1) {
      const start = marks[i].index;
      const end = i + 1 < marks.length ? marks[i + 1].index : normalized.length;
      const content = normalized.slice(start, end).trim();
      if (content.length > 20) {
        slices.push({ title: marks[i].title, content });
      }
    }
  } else {
    // 无章节标记：按 ~1200 字在段落边界切片。
    const paragraphs = normalized.split(/\n{2,}|\n/).filter((item) => item.trim());
    let buffer = '';
    let index = 1;
    for (const paragraph of paragraphs) {
      if (buffer.length + paragraph.length > 1200 && buffer) {
        slices.push({ title: `片段 ${index}`, content: buffer.trim() });
        index += 1;
        buffer = '';
      }
      buffer += `${paragraph}\n`;
    }
    if (buffer.trim()) {
      slices.push({ title: `片段 ${index}`, content: buffer.trim() });
    }
  }
  if (slices.length === 0) {
    throw new BadRequestException('切分结果为空，请检查文本内容');
  }
  return slices.slice(0, 50).map((slice, idx) => ({ idx: idx + 1, title: slice.title, content: slice.content }));
};
