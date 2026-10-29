// SRT 字幕纯函数单测：时间格式化进位 + 顺序累加时间轴与空文本段占时。
import { buildSrt, formatSrtTime } from '../src/modules/flow/novel/subtitle.util';

describe('formatSrtTime', () => {
  it('毫秒 → HH:MM:SS,mmm 基础格式', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(500)).toBe('00:00:00,500');
  });

  it('秒/分/时逐级进位', () => {
    expect(formatSrtTime(61000)).toBe('00:01:01,000');
    expect(formatSrtTime(3661550)).toBe('01:01:01,550');
    expect(formatSrtTime(65500)).toBe('00:01:05,500');
  });

  it('毫秒不足三位补零', () => {
    expect(formatSrtTime(1)).toBe('00:00:00,001');
    expect(formatSrtTime(90)).toBe('00:00:00,090');
  });

  it('负数按 0 处理', () => {
    expect(formatSrtTime(-5)).toBe('00:00:00,000');
  });
});

describe('buildSrt', () => {
  it('按段顺序累加时间轴（start = 前段 end），序号连续', () => {
    const srt = buildSrt([
      { text: '夜色渐深', durationMs: 500 },
      { text: '路灯亮了', durationMs: 1500 }
    ]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:00,500\n夜色渐深\n\n2\n00:00:00,500 --> 00:00:02,000\n路灯亮了\n');
  });

  it('空文本段占时不出字幕（时间轴照常推进）', () => {
    const srt = buildSrt([
      { text: '第一句', durationMs: 1000 },
      { text: '   ', durationMs: 800 },
      { text: '', durationMs: 0 },
      { text: '第三句', durationMs: 1200 }
    ]);
    // 空段 800ms 与 0ms 段只推进时间轴；第三句从 1800ms 开始。
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n第一句\n\n2\n00:00:01,800 --> 00:00:03,000\n第三句\n'
    );
  });

  it('全部为空文本段时返回空字符串', () => {
    expect(buildSrt([{ text: '', durationMs: 500 }])).toBe('');
    expect(buildSrt([])).toBe('');
  });

  it('负时长按 0 处理不产生倒退时间轴', () => {
    const srt = buildSrt([
      { text: 'A', durationMs: 500 },
      { text: 'B', durationMs: -100 }
    ]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:00,500\nA\n\n2\n00:00:00,500 --> 00:00:00,500\nB\n');
  });
});
