// 合规检查链纯函数单测（不依赖网络与 Nest 容器，照 publisher-metrics.util.spec.ts 头部范式）：
// normalizeText 长度保持归一 / scanText 重叠报告与位置映射 / computeVerdict 三级结论 / buildContextClip 边界。
import {
  buildContextClip,
  computeVerdict,
  countByLevel,
  normalizeText,
  scanText
} from '../src/modules/compliance/scan.util';
import { ScanHit, ScanWord } from '../src/modules/compliance/compliance.types';

const w = (word: string, level: ScanWord['level']): ScanWord => ({ word, level });

describe('normalizeText（逐码元长度保持归一）', () => {
  it('①空文本返回空串', () => {
    expect(normalizeText('')).toBe('');
  });

  it('②英文大写归一小写', () => {
    expect(normalizeText('Gamble BAD')).toBe('gamble bad');
  });

  it('③全角英数字符号归一半角（ＢＡＤ１２３→bad123，！？→!?）', () => {
    expect(normalizeText('ＢＡＤ１２３！？')).toBe('bad123!?');
  });

  it('④全角空格 U+3000 归一半角空格', () => {
    expect(normalizeText('赌\u3000博')).toBe('赌 博');
  });

  it('⑤归一保长：混合样本（emoji 代理对/多码元小写/全角/汉字）归一后 length 相等（位置映射前提）', () => {
    const sample = 'AｂＣ😀İ赌博\u3000ＸＹＺ123';
    expect(normalizeText(sample).length).toBe(sample.length);
  });
});

describe('scanText（重叠全报告 + 原文位置回溯）', () => {
  it('⑥空文本返回空数组', () => {
    expect(scanText('', [w('赌博', 'block')])).toEqual([]);
  });

  it('⑦空词库返回空数组', () => {
    expect(scanText('赌博网站', [])).toEqual([]);
  });

  it('⑧单词单命中：词/级别/位置正确（start 含头不含尾）', () => {
    const hits = scanText('十元起赌博网站速来', [w('赌博', 'block')]);
    expect(hits).toEqual([{ word: '赌博', level: 'block', start: 3, end: 5 }]);
  });

  it('⑨一词多处命中全部返回且 start 递增（同词自身不重叠）', () => {
    const hits = scanText('赌博与赌博', [w('赌博', 'block')]);
    expect(hits.map((hit) => [hit.start, hit.end])).toEqual([[0, 2], [3, 5]]);
  });

  it('⑩英文大小写不敏感：库 gamble vs 文 Gamble GAMBLE 两命中', () => {
    const hits = scanText('Gamble GAMBLE', [w('gamble', 'review')]);
    expect(hits.map((hit) => [hit.start, hit.end])).toEqual([[0, 6], [7, 13]]);
  });

  it('⑪全半角互通：库 abc 命中文 ＡＢＣ', () => {
    const hits = scanText('ＡＢＣ', [w('abc', 'replace')]);
    expect(hits).toEqual([{ word: 'abc', level: 'replace', start: 0, end: 3 }]);
  });

  it('⑫不同词重叠命中全报告且 start 升序（库赌博/博彩网站/赌博网站 文赌博网站博彩网站三命中）', () => {
    const hits = scanText('赌博网站博彩网站', [
      w('赌博', 'block'),
      w('博彩网站', 'block'),
      w('赌博网站', 'block')
    ]);
    expect(hits.map((hit) => hit.word)).toEqual(['赌博', '赌博网站', '博彩网站']);
    expect(hits.map((hit) => [hit.start, hit.end])).toEqual([[0, 2], [0, 4], [4, 8]]);
  });

  it('⑬同词相邻出现不吞并：哈哈哈哈 两命中', () => {
    const hits = scanText('哈哈哈哈', [w('哈哈', 'review')]);
    expect(hits.map((hit) => [hit.start, hit.end])).toEqual([[0, 2], [2, 4]]);
  });

  it('⑭词库空串/纯空白词跳过不报错', () => {
    expect(scanText('赌博网站', [w('', 'block'), w('   ', 'block'), w('赌博', 'block')])).toEqual([
      { word: '赌博', level: 'block', start: 0, end: 2 }
    ]);
  });

  it('⑮超长文本（10 万字符、命中词在末尾）位置正确无异常', () => {
    const text = 'a'.repeat(99998) + '赌博';
    const hits = scanText(text, [w('赌博', 'block')]);
    expect(hits).toEqual([{ word: '赌博', level: 'block', start: 99998, end: 100000 }]);
  });

  it('⑯位置回溯原文：含 emoji 代理对文本 slice(start,end) 等于库词（长度保持映射）', () => {
    const text = '前置😀赌博后置';
    const hits = scanText(text, [w('赌博', 'block')]);
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0].start, hits[0].end)).toBe('赌博');
    expect(normalizeText(text).slice(hits[0].start, hits[0].end)).toBe('赌博');
  });

  it('⑰level 随库词透传（block/review/replace 各归各位）', () => {
    const hits = scanText('甲乙丙', [w('甲', 'block'), w('乙', 'review'), w('丙', 'replace')]);
    expect(hits.map((hit) => hit.level)).toEqual(['block', 'review', 'replace']);
  });
});

describe('computeVerdict（AIGC 红线 + 三级结论）', () => {
  const hit = (level: ScanHit['level']): ScanHit => ({ word: 'x', level, start: 0, end: 1 });

  it('⑱无命中+已声明→pass', () => {
    expect(computeVerdict([], true)).toBe('pass');
  });

  it('⑲无命中+未声明→blocked（平台强制红线）', () => {
    expect(computeVerdict([], false)).toBe('blocked');
  });

  it('⑳含 block 命中→blocked', () => {
    expect(computeVerdict([hit('block')], true)).toBe('blocked');
  });

  it('㉑无 block 含 review→review', () => {
    expect(computeVerdict([hit('review')], true)).toBe('review');
  });

  it('㉒仅 replace→pass（提示不影响结论）', () => {
    expect(computeVerdict([hit('replace'), hit('replace')], true)).toBe('pass');
  });

  it('㉓block+未声明→blocked（优先级正确，结论唯一）', () => {
    expect(computeVerdict([hit('block'), hit('review'), hit('replace')], false)).toBe('blocked');
  });

  it('㉔summary 计数与 hits 恒一致（countByLevel 全级别键齐备）', () => {
    const hits = [hit('block'), hit('replace'), hit('replace')];
    expect(countByLevel(hits)).toEqual({ block: 1, review: 0, replace: 2 });
    expect(countByLevel([])).toEqual({ block: 0, review: 0, replace: 0 });
  });
});

describe('buildContextClip（±10 字符边界截断）', () => {
  it('㉕命中居中：前后各 10 字符，两侧截断侧都以「……」占位（照报告示例文案）', () => {
    const text = '0123456789ABCDEFGHIJ赌博KLMNOPQRSTUV';
    const hits = scanText(text, [w('赌博', 'block')]);
    const clip = buildContextClip(text, hits[0].start, hits[0].end);
    expect(clip).toBe(`……${text.slice(hits[0].start - 10, hits[0].end + 10)}……`);
  });

  it('㉕开头边界截断：无前缀省略号、不越界', () => {
    const text = '赌博就在开头';
    const clip = buildContextClip(text, 0, 2);
    expect(clip).toBe('赌博就在开头');
    expect(clip.startsWith('……')).toBe(false);
  });

  it('㉕结尾边界截断：有前缀省略号、无后缀省略号、不越界', () => {
    const text = '结尾前面有一段铺垫文字结尾就是赌博';
    const clip = buildContextClip(text, 15, 17);
    expect(clip).toBe('……一段铺垫文字结尾就是赌博');
    expect(clip.endsWith('……')).toBe(false);
  });

  it('㉕窗口左缘落在代理对中间：回退吞入完整 emoji，不出现半个乱码字符', () => {
    // 'x'(0) '😀'(1,2) 'abcdefghi'(3..11) '赌'(12) '尾'(13)：from=2 恰是 😀 低代理位 → 回退到 1
    const text = 'x😀abcdefghi赌尾';
    const clip = buildContextClip(text, 12, 13);
    expect(clip).toBe('……😀abcdefghi赌尾');
  });

  it('㉕窗口右缘落在代理对中间：扩进完整 emoji，不出现半个乱码字符', () => {
    // '赌博'(0,1) 'abcdefghi'(2..10) '😀'(11,12) '尾'(13)：to=12 恰是 😀 低代理位 → 扩到 13
    const text = '赌博abcdefghi😀尾';
    const clip = buildContextClip(text, 0, 2);
    expect(clip).toBe('赌博abcdefghi😀……');
  });
});
