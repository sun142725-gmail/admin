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
