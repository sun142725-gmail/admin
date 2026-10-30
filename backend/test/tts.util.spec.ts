// TTS 纯函数单测：文本归一化 / 时长估算 / ffprobe JSON 输出解析。
import {
  estimateSpeechMs,
  MAX_TTS_TEXT_LENGTH,
  normalizeTtsText,
  parseFfprobeDuration
} from '../src/modules/flow/engine/tts.util';

describe('normalizeTtsText', () => {
  it('剥离 ```json 围栏与语言标记行', () => {
    expect(normalizeTtsText('```json\n{"narration":"夜色渐深"}\n```')).toBe('{"narration":"夜色渐深"}');
    expect(normalizeTtsText('```\n第一段旁白\n```')).toBe('第一段旁白');
  });

  it('剥离多个成对围栏并拼接内容', () => {
    expect(normalizeTtsText('```text\nA\n```\n```text\nB\n```')).toBe('A B');
  });

  it('未闭合围栏删除孤立 ``` 行', () => {
    expect(normalizeTtsText('开场旁白\n```\n正文继续')).toBe('开场旁白 正文继续');
  });

  it('折叠连续空白（换行/制表/多空格）为单空格', () => {
    expect(normalizeTtsText('夜色  渐深\n\n\t路灯 亮了')).toBe('夜色 渐深 路灯 亮了');
  });

  it('超过 2000 字截断', () => {
    const long = '字'.repeat(MAX_TTS_TEXT_LENGTH + 500);
    expect([...normalizeTtsText(long)]).toHaveLength(MAX_TTS_TEXT_LENGTH);
  });

  it('空串/纯空白返回空串', () => {
    expect(normalizeTtsText('')).toBe('');
    expect(normalizeTtsText('   \n\t ')).toBe('');
  });
});

describe('estimateSpeechMs', () => {
  it('中文按 4 字/秒估算（8 字 = 2000ms）', () => {
    expect(estimateSpeechMs('夜色渐深路灯亮了')).toBe(2000);
  });

  it('英文按 15 词/秒估算（30 词 = 2000ms）', () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    expect(estimateSpeechMs(words)).toBe(2000);
  });

  it('中英混排分别累加', () => {
    // 4 个中文（1000ms）+ 15 个英文词（1000ms）= 2000ms。
    expect(estimateSpeechMs('夜色渐深 word word word word word word word word word word word word word word word')).toBe(
      2000
    );
  });

  it('空串/纯标点返回 0（调用方兜底）', () => {
    expect(estimateSpeechMs('')).toBe(0);
    expect(estimateSpeechMs('，。！？')).toBe(0);
  });
});

describe('parseFfprobeDuration', () => {
  it('解析 ffprobe -print_format json 输出：format.duration 秒 → 毫秒', () => {
    const stdout = JSON.stringify({ format: { duration: '0.500000', size: '2444' } });
    expect(parseFfprobeDuration(stdout)).toBe(500);
  });

  it('整数秒向上取整为毫秒', () => {
    expect(parseFfprobeDuration(JSON.stringify({ format: { duration: '2.5' } }))).toBe(2500);
  });

  it('duration 缺失返回 null', () => {
    expect(parseFfprobeDuration(JSON.stringify({ format: { size: '100' } }))).toBeNull();
    expect(parseFfprobeDuration(JSON.stringify({}))).toBeNull();
  });

  it('非法 JSON 返回 null', () => {
    expect(parseFfprobeDuration('not json')).toBeNull();
    expect(parseFfprobeDuration('')).toBeNull();
  });

  it('非正数/非数值 duration 返回 null', () => {
    expect(parseFfprobeDuration(JSON.stringify({ format: { duration: '-1.0' } }))).toBeNull();
    expect(parseFfprobeDuration(JSON.stringify({ format: { duration: 'N/A' } }))).toBeNull();
    expect(parseFfprobeDuration(JSON.stringify({ format: { duration: 0 } }))).toBeNull();
  });
});

// ---------- 真实旁白扩展（素材口径见 fixtures/novel-fixtures.ts 头注释，仿写非原文） ----------

describe('normalizeTtsText（真实旁白）', () => {
  it('「」对话/省略号/破折号/换行混排：空白折叠为单空格，标点原样保留', () => {
    const raw = '「你相信这世上真有仙吗？」\n\r\n他望向夜空……星河低垂——仿佛触手可及。\n\n「我不知道，」她说，「但今夜没有人睡得着。」';
    expect(normalizeTtsText(raw)).toBe(
      '「你相信这世上真有仙吗？」 他望向夜空……星河低垂——仿佛触手可及。 「我不知道，」她说，「但今夜没有人睡得着。」'
    );
  });

  it('省略号不误删：围栏剥离后真实对白原样输出', () => {
    expect(normalizeTtsText('```text\n「天棺坠于流沙……凿之者死。」\n```')).toBe('「天棺坠于流沙……凿之者死。」');
  });

  it('超 2000 码点截断不劈字（代理对完整、末尾非孤立高代理）', () => {
    // '𠀋'（U+2000B）是代理对：按码点截断必须整字保留。
    const raw = '仙'.repeat(1500) + '𠀋'.repeat(600);
    const normalized = normalizeTtsText(raw);
    expect([...normalized]).toHaveLength(MAX_TTS_TEXT_LENGTH);
    expect([...normalized][1999]).toBe('𠀋');
    expect(/[\uD800-\uDBFF]$/.test(normalized)).toBe(false);
  });
});

describe('estimateSpeechMs（真实旁白）', () => {
  it('中文计数不含标点：夜色如墨，星光黯淡。= 8 个 CJK → 2000ms', () => {
    expect(estimateSpeechMs('夜色如墨，星光黯淡。')).toBe(2000);
  });

  it('中英数字混排分别累加：坐标 N39，海拔 1287 米', () => {
    // CJK：坐标/海拔/米 = 5 字 → 1250ms；英文词：'N39' 中的 N = 1 词 → 66.67ms；合计 1317ms。
    expect(estimateSpeechMs('坐标 N39，海拔 1287 米')).toBe(1317);
  });
});
