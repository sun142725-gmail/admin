// 章节切分纯函数单测（真实中文长文本 fixture，素材口径见 fixtures/novel-fixtures.ts 头注释）。
import { BadRequestException } from '@nestjs/common';
import { splitChapterText } from '../src/modules/flow/novel/chapter-split.util';
import { NO_TITLE_LONG_TEXT, ZHETIAN_EXCERPT, ZHETIAN_PASTICHE } from './fixtures/novel-fixtures';

describe('splitChapterText（章节标题路径）', () => {
  it('按「第一章/第二章/第三章」标题行正确切分：标题截取、idx 连续、每片 content>20', () => {
    const slices = splitChapterText(ZHETIAN_PASTICHE);
    expect(slices.length).toBeGreaterThanOrEqual(3);
    expect(slices.map((slice) => slice.title)).toEqual(['第一章 荒原星夜', '第二章 铜棺疑影', '第三章 长明灯']);
    slices.forEach((slice, index) => {
      expect(slice.idx).toBe(index + 1);
      expect(slice.content.length).toBeGreaterThan(20);
      // 原实现口径：content 从标题行起切，含标题本身。
      expect(slice.content.startsWith(slice.title)).toBe(true);
    });
  });

  it('切片重组后包含原文摘录关键句（内容完整性性质断言）', () => {
    const slices = splitChapterText(ZHETIAN_PASTICHE);
    const joined = slices.map((slice) => slice.content).join('\n');
    expect(joined).toContain(ZHETIAN_EXCERPT);
    // 排版要素在切分结果中保持原样：对话引号、省略号、破折号。
    expect(joined).toContain('「坐标……就在我们头顶！」');
    expect(joined).toContain('——');
  });

  it('CRLF/\\n 混排与归一化结果一致', () => {
    const clean = ZHETIAN_PASTICHE.replace(/\r\n/g, '\n');
    // fixture 本身是混排：切分结果与纯 \n 版本一致（归一化生效）。
    expect(splitChapterText(ZHETIAN_PASTICHE)).toEqual(splitChapterText(clean));
    // 全量转 CRLF 后切分结果不变（\r\n 与 \n 等价处理）。
    expect(splitChapterText(clean.replace(/\n/g, '\r\n'))).toEqual(splitChapterText(clean));
  });
});

describe('splitChapterText（段落路径）', () => {
  it('无标题 >1200 字文本按段落边界切为「片段 N」，单片不超上限、不含章节标记', () => {
    expect([...NO_TITLE_LONG_TEXT].length).toBeGreaterThan(1200);
    const slices = splitChapterText(NO_TITLE_LONG_TEXT);
    expect(slices.length).toBeGreaterThanOrEqual(2);
    slices.forEach((slice, index) => {
      expect(slice.title).toBe(`片段 ${index + 1}`);
      expect(slice.content.length).toBeLessThanOrEqual(1200);
      expect(slice.content).not.toMatch(/第[一二三四五六七八九十百千万零\d]+[章回节]/);
    });
  });

  it('切片重组后仍包含各段落关键句（内容完整性）', () => {
    const joined = splitChapterText(NO_TITLE_LONG_TEXT)
      .map((slice) => slice.content)
      .join('\n');
    expect(joined).toContain('落棺滩');
    expect(joined).toContain('九百年');
  });

  it('切片上限 50 截断（55 个自超限段落 → 恰好 50 片）', () => {
    // 每段约 1300 字（单段即超 1200 上限 → 独立成片），55 段产出 55 片后被 slice(0, 50) 截断。
    const paragraphs = Array.from({ length: 55 }, (_, i) => `${'荒'.repeat(649)}段${i}${'原'.repeat(648)}`);
    const slices = splitChapterText(paragraphs.join('\n\n'));
    expect(slices).toHaveLength(50);
    expect(slices[49].idx).toBe(50);
  });
});

describe('splitChapterText（异常路径，文案与原实现一致）', () => {
  it('空/纯空白文本抛 BadRequestException：小说内容为空', () => {
    expect(() => splitChapterText('')).toThrow(BadRequestException);
    expect(() => splitChapterText('   \n\t ')).toThrow('小说内容为空');
  });

  it('仅两个短标题行（content≤20 全被过滤）抛：切分结果为空，请检查文本内容', () => {
    expect(() => splitChapterText('第一章 空一\n第二章 空二')).toThrow('切分结果为空，请检查文本内容');
  });
});
