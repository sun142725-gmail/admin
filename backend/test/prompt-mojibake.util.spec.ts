// 乱码判定/还原纯函数单测（不依赖 DB/网络，AGENTS 规则 1）。
// 锚点来源：2026-10 乱码审计报告——id=2..6 五行 latin1(=cp1252) 双重编码真实样本，
// 其中「移动端 → ç§»åŠ¨ç«¯」为审计逐字节验证过的真实锚点；id=2 name 的 HEX 前缀
// C3A6C2B0C2B4C3A5C2BDC2A9（水彩绘本插画 双重编码后）同为审计实锤。
import { createHash } from 'crypto';
import {
  MAX_RESTORE_ROUNDS,
  computePromptHash,
  containsCjk,
  isRestorableMojibake,
  toCp1252Mojibake
} from '../scripts/prompt-mojibake.core';

// 审计还原报告（rows.restoredPreview）中的 id=2..6 中文字段样本。
const AUDIT_ROWS: Array<{ id: number; name: string; styleTags: string; template: string; source: string }> = [
  {
    id: 2,
    name: '水彩绘本插画',
    styleTags: '水彩,手绘,温暖治愈',
    template: '水彩手绘绘本插画：{{content}}。柔和光线，纸质纹理，色调温暖治愈，笔触保留水彩晕染感。',
    source: '官方示例'
  },
  {
    id: 3,
    name: '日系动漫赛璐璐',
    styleTags: '动漫,赛璐璐,高饱和',
    template: '日系赛璐璐风格动漫插画：{{content}}。清晰线稿，明快色块，高光锐利，新海诚式光影氛围，16:9 构图。',
    source: '官方示例'
  },
  {
    id: 4,
    name: '新海诚风夜景',
    styleTags: '动漫,夜景,光影,星空',
    template: '新海诚风格动漫场景：{{content}}。夜空星轨与城市光晕交织，空气感强，色彩通透，细节丰富。',
    source: '官方示例'
  },
  {
    id: 5,
    name: '现代简约海报',
    styleTags: '海报,扁平,大字版式',
    template: '现代扁平风格海报设计：{{content}}。大面积留白，几何色块分割，粗壮标题字版式，单色系加一处亮色点缀。',
    source: '官方示例'
  },
  {
    id: 6,
    name: '移动端 UI 界面',
    styleTags: 'UI,界面,圆角卡片',
    template: '移动端 App 界面设计：{{content}}。iOS 风格圆角卡片布局，8pt 栅格，浅色底加主色按钮，图标线性风格。',
    source: '官方示例'
  }
];

describe('toCp1252Mojibake（逆向构造，锚点校验）', () => {
  it('真实锚点：移动端 → ç§»åŠ¨ç«¯（审计逐字节验证）', () => {
    expect(toCp1252Mojibake('移动端')).toBe('ç§»åŠ¨ç«¯');
  });

  it('id=2 name 双重编码 HEX 前缀与审计一致（C3A6C2B0C2B4C3A5C2BDC2A9…）', () => {
    const mojibake = toCp1252Mojibake('水彩绘本插画');
    expect(Buffer.from(mojibake, 'utf8').toString('hex').startsWith('c3a6c2b0c2b4c3a5c2bdc2a9')).toBe(true);
  });

  it('cp1252 全部 27 项特殊映射可逆（含 €‚ƒ„…†‡ˆ‰Š‹ŒŽ 弯引号/破折号/œžŸ 等）', () => {
    // 测试侧独立转写 cp1252 规范的（字符, 字节）表，与实现互证。
    const SPECIALS: Array<[string, number]> = [
      ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
      ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e],
      ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
      ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f]
    ];
    expect(SPECIALS).toHaveLength(27);
    for (const [char, byte] of SPECIALS) {
      // 载体字符 UTF-8 = [E4, byte, 0x80]（CJK 扩展 A 区 U+4000 起），双重编码必含该特殊字符。
      const original = String.fromCodePoint(0x4000 + (byte - 0x80) * 0x40);
      const mojibake = toCp1252Mojibake(original);
      expect(mojibake).toContain(char);
      const judgement = isRestorableMojibake(mojibake);
      expect(judgement.restorable).toBe(true);
      expect(judgement.restored).toBe(original);
    }
  });

  it('含 U+2019（cp1252 0x92）的真实样本可还原（审计样本含 E28099 序列）', () => {
    const original = "it’s 移动端"; // U+2019 弯引号
    const mojibake = toCp1252Mojibake(original);
    expect(mojibake).toBe("itâ€™s ç§»åŠ¨ç«¯");
    expect(isRestorableMojibake(mojibake)).toMatchObject({ restorable: true, restored: original, rounds: 1 });
  });
});

describe('isRestorableMojibake（五条件判定）', () => {
  it('审计 id=2..6 全部中文字段：1 轮还原、还原结果与还原文逐字符一致', () => {
    for (const row of AUDIT_ROWS) {
      for (const value of [row.name, row.styleTags, row.template, row.source]) {
        const mojibake = toCp1252Mojibake(value);
        const judgement = isRestorableMojibake(mojibake);
        expect(judgement.restorable).toBe(true);
        expect(judgement.restored).toBe(value);
        expect(judgement.rounds).toBe(1);
        // 幂等性质：还原文再判一次必须不命中（含 CJK 跳过）。
        expect(isRestorableMojibake(judgement.restored!).restorable).toBe(false);
      }
    }
  });

  it('id=6 真实锚点：ç§»åŠ¨ç«¯ → 移动端（混合 ASCII 不受影响）', () => {
    const judgement = isRestorableMojibake('ç§»åŠ¨ç«¯ UI ç•Œé\u009D¢');
    expect(judgement.restorable).toBe(true);
    expect(judgement.restored).toBe('移动端 UI 界面');
  });

  it('已含 CJK 的值跳过（不命中条件 a，修复后重跑天然幂等）', () => {
    const judgement = isRestorableMojibake('水彩,手绘,温暖治愈');
    expect(judgement.restorable).toBe(false);
    expect(judgement.reason).toContain('已含 CJK');
    expect(judgement.rounds).toBe(0);
  });

  it('双重乱码 2 轮还原', () => {
    const double = toCp1252Mojibake(toCp1252Mojibake('移动端'));
    expect(double).not.toBe(toCp1252Mojibake('移动端'));
    const judgement = isRestorableMojibake(double);
    expect(judgement.restorable).toBe(true);
    expect(judgement.restored).toBe('移动端');
    expect(judgement.rounds).toBe(2);
  });

  it('超过 3 轮的多重乱码拒绝（MAX_RESTORE_ROUNDS 上限）', () => {
    let text = '移动端';
    for (let i = 0; i < 4; i += 1) {
      text = toCp1252Mojibake(text);
    }
    const judgement = isRestorableMojibake(text);
    expect(judgement.restorable).toBe(false);
    expect(judgement.reason).toContain(`还原 ${MAX_RESTORE_ROUNDS} 轮仍未出现 CJK`);
  });

  it('含不可反查字符（U+0100 以上）判不可还原并给 reason', () => {
    const judgement = isRestorableMojibake(`ç§»åŠ¨ç«¯α`); // 希腊 α=U+03B1 不可反查
    expect(judgement.restorable).toBe(false);
    expect(judgement.reason).toContain('不可反查字符');
  });

  it('字节序列非法 UTF-8 判不可还原并给 reason', () => {
    const judgement = isRestorableMojibake('å½'); // E5 BD：E5 需要两个续字节，截断非法
    expect(judgement.restorable).toBe(false);
    expect(judgement.reason).toContain('不是合法 UTF-8');
  });

  it('cp1252 未定义字节的 C1 控制位（如 插=E6 8F 92 的 0x8F→U+008F）按 MySQL 语义可还原', () => {
    const judgement = isRestorableMojibake(toCp1252Mojibake('插画'));
    expect(judgement.restorable).toBe(true);
    expect(judgement.restored).toBe('插画');
  });

  it('歧义 C1 控制位（应为特殊表字符的位置出现原始控制符）被往返校验拒绝', () => {
    // 'â\u0091€' 反查字节 E2 91 80 解码为 ℐ，但 0x91 在 cp1252 中应是 ‘ 而非 U+0091 → 往返失败。
    const judgement = isRestorableMojibake('â\u0091€');
    expect(judgement.restorable).toBe(false);
    expect(judgement.reason).toContain('往返校验失败');
  });

  it('ASCII 字段不命中（还原后无 CJK，条件 d 拒绝）', () => {
    for (const ascii of ['illustrated', '/uploads/graphic/story-2/scene-1.jpg', 'midjourney', '{{content}}']) {
      const judgement = isRestorableMojibake(ascii);
      expect(judgement.restorable).toBe(false);
      expect(judgement.restored).toBeUndefined();
    }
  });

  it('空串/纯空白判不可还原', () => {
    expect(isRestorableMojibake('')).toMatchObject({ restorable: false });
    expect(isRestorableMojibake('   ')).toMatchObject({ restorable: false });
  });
});

describe('containsCjk', () => {
  it('覆盖 CJK 扩展 A / 基本区 / 兼容区', () => {
    expect(containsCjk('移动端')).toBe(true);
    expect(containsCjk('\u3400')).toBe(true);
    expect(containsCjk('落')).toBe(true); // U+F9A0 兼容表意区
    expect(containsCjk('ç§»åŠ¨ç«¯')).toBe(false);
    expect(containsCjk('illustrated')).toBe(false);
  });
});

describe('computePromptHash（与 prompt-library.service.ts hashPrompt 口径一致）', () => {
  it('sha256(trim(template))，与 service 私有 hashPrompt 同式', () => {
    const expected = createHash('sha256').update('水彩手绘绘本插画：{{content}}。柔和光线。').digest('hex');
    expect(computePromptHash('  水彩手绘绘本插画：{{content}}。柔和光线。  ')).toBe(expected);
  });

  it('产出 64 位小写 hex（与 uk_prompt_templates_hash 列长度 64 对齐）', () => {
    expect(computePromptHash('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
