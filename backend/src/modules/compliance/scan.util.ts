// 合规检查链纯函数（不依赖网络与 Nest 容器，AGENTS 规则 4）：归一、扫描、结论、上下文片段。
// 归一口径：逐码元 1:1 长度保持映射（不用 String.prototype.normalize('NFKC')——NFKC 可变长
// 如 ﬁ→fi 会破坏位置映射）。文本与词用同一函数归一后 indexOf 匹配，
// 因此命中位置 = 原始文本 UTF-16 码元偏移，可直接 slice 回溯原文。
import { ComplianceLevel, ScanHit, ScanWord } from './compliance.types';

/**
 * 长度保持归一：
 *  - 全角 ASCII（U+FF01–U+FF5E）减 0xFEE0 折半角（ＢＡＤ→bad、１２３→123、！→!）；
 *  - 全角空格 U+3000 → 半角空格；
 *  - 其余逐码元 toLowerCase，映射结果非单码元则保留原字符（保证 length 不变）。
 * 代理对（emoji 等）逐码元处理各自原样保留，长度不变，位置映射成立。
 */
export function normalizeText(text: string): string {
  if (!text) {
    return '';
  }
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    let mapped: string;
    if (code >= 0xff01 && code <= 0xff5e) {
      mapped = String.fromCharCode(code - 0xfee0);
    } else if (code === 0x3000) {
      mapped = ' ';
    } else {
      mapped = String.fromCharCode(code);
    }
    const lowered = mapped.toLowerCase();
    // 单码元字符 lowers 仍为单码元才替换；多码元映射（如 İ→i+̇ ）保留原字符保长度
    out += lowered.length === 1 ? lowered : mapped;
  }
  return out;
}

/**
 * 在单段文本上扫描词库：
 *  - 空文本/空词库 → []；词库空串/纯空白词跳过（防御）；
 *  - 同词从左到右找全部不重叠出现（自身不重叠）；不同词的重叠命中全部报告
 *    （宁可多报不漏报，整体结论取最高级别）；
 *  - 返回按 start 升序、同起点按 end 升序；level 随库词透传。
 */
export function scanText(text: string, words: ReadonlyArray<ScanWord>): ScanHit[] {
  if (!text || words.length === 0) {
    return [];
  }
  const normalized = normalizeText(text);
  const hits: ScanHit[] = [];
  for (const item of words) {
    if (!item || !item.word || !item.word.trim()) {
      continue;
    }
    // normalizeText 长度保持，needle.length 即原始词的码元长度
    const needle = normalizeText(item.word);
    if (!needle) {
      continue;
    }
    let from = 0;
    for (;;) {
      const at = normalized.indexOf(needle, from);
      if (at === -1) {
        break;
      }
      hits.push({ word: item.word, level: item.level, start: at, end: at + needle.length });
      from = at + needle.length;
    }
  }
  hits.sort((a, b) => a.start - b.start || a.end - b.end);
  return hits;
}

/**
 * 整体结论（与报告 verdictRule 字符串同源，见 compliance.types）：
 * aigc 未声明 或 存在 block 命中 → blocked；否则存在 review → review；否则 pass
 * （仅 replace → pass；无任何文案字段也照此判定，AIGC 未声明照样 blocked）。
 */
export function computeVerdict(
  hits: ReadonlyArray<ScanHit>,
  aigcDeclared: boolean
): 'pass' | 'review' | 'blocked' {
  if (!aigcDeclared || hits.some((hit) => hit.level === 'block')) {
    return 'blocked';
  }
  if (hits.some((hit) => hit.level === 'review')) {
    return 'review';
  }
  return 'pass';
}

// UTF-16 低代理位判定（U+DC00–U+DFFF）：切点落在低代理位 = 代理对 (切点-1, 切点) 被劈开
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/**
 * 命中上下文片段：前后各 radius（默认 10）字符，边界截断不越界；
 * 截断侧以「……」占位提示（居中命中两侧都带，照报告示例文案）。
 * 窗口边缘切在代理对中间时回退/扩进到完整对（仅展示层；start/end 命中偏移由 needle
 * 对齐天然成对边界，不动）。孤立代理等畸形序列不在设防范围。
 */
export function buildContextClip(text: string, start: number, end: number, radius = 10): string {
  let from = Math.max(0, start - radius);
  let to = Math.min(text.length, end + radius);
  // 切在成对边界/对之前/对之后都不会命中低代理位；一对恰 2 码元，单步回退/扩进即到完整边界
  if (from > 0 && isLowSurrogate(text.charCodeAt(from))) {
    from -= 1;
  }
  if (to < text.length && isLowSurrogate(text.charCodeAt(to))) {
    to += 1;
  }
  const prefix = from > 0 ? '……' : '';
  const suffix = to < text.length ? '……' : '';
  return `${prefix}${text.slice(from, to)}${suffix}`;
}

// 便捷导出：级别判定辅助（summary 计数用，保持与 hits 恒一致）
export function countByLevel(hits: ReadonlyArray<ScanHit>): Record<ComplianceLevel, number> {
  const summary: Record<ComplianceLevel, number> = { block: 0, review: 0, replace: 0 };
  for (const hit of hits) {
    summary[hit.level] += 1;
  }
  return summary;
}
