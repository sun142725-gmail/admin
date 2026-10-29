// TTS 纯函数工具：文本归一化 / 语速时长估算 / ffprobe 输出解析。
// 网络调用（adapter.speech）与子进程（ffprobe）不在此处，保持可单测（AGENTS 规则 4）。

// 单次合成文本长度上限：超长文本上游容易拒绝/超时，管线按句切分调用方负责。
export const MAX_TTS_TEXT_LENGTH = 2000;

/**
 * 归一化待合成文本：剥 markdown 代码围栏、折叠连续空白、截断到 2000 字。
 * LLM 产出的旁白常带 ``` 包裹或换行修饰，直接送 TTS 会被读出来。
 */
export const normalizeTtsText = (raw: string): string => {
  let text = raw ?? '';
  // 成对围栏：取所有 ```lang ... ``` 内的内容拼接；语言标记行一并剥掉。
  const fenced = [...text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/g)];
  if (fenced.length > 0) {
    text = fenced.map((match) => match[1]).join('\n');
  } else {
    // 未闭合围栏：退而求其次，删掉孤立的 ``` 行。
    text = text.replace(/^\s*```[a-zA-Z0-9_-]*\s*$/gm, '');
  }
  // 折叠所有空白（含换行/制表）为单空格并去首尾。
  text = text.replace(/\s+/g, ' ').trim();
  if ([...text].length > MAX_TTS_TEXT_LENGTH) {
    text = [...text].slice(0, MAX_TTS_TEXT_LENGTH).join('');
  }
  return text;
};

// 中文按 4 字/秒、英文按 15 词/秒的估算基数（普通旁白语速）。
const CHINESE_CHARS_PER_SECOND = 4;
const ENGLISH_WORDS_PER_SECOND = 15;
const CJK_PATTERN = /[\u4e00-\u9fff]/g;
const WORD_PATTERN = /[a-zA-Z]+/g;

/**
 * 估算朗读时长毫秒：中文字符与英文单词分别按各自语速累加。
 * 无有效字符（空串/纯标点）返回 0，由调用方兜底。
 */
export const estimateSpeechMs = (text: string): number => {
  const source = text ?? '';
  const chineseChars = (source.match(CJK_PATTERN) ?? []).length;
  const englishWords = (source.match(WORD_PATTERN) ?? []).length;
  const seconds = chineseChars / CHINESE_CHARS_PER_SECOND + englishWords / ENGLISH_WORDS_PER_SECOND;
  return Math.round(seconds * 1000);
};

export interface FfprobeFormat {
  format?: { duration?: string | number };
}

/**
 * 解析 ffprobe -print_format json -show_format 的 stdout：format.duration（秒）→ 毫秒。
 * 输出非法 / 缺失 duration / 非正数一律返回 null，由调用方回落估算。
 */
export const parseFfprobeDuration = (stdout: string): number | null => {
  if (!stdout) {
    return null;
  }
  let parsed: FfprobeFormat;
  try {
    parsed = JSON.parse(stdout) as FfprobeFormat;
  } catch {
    return null;
  }
  const duration = parsed?.format?.duration;
  if (duration === undefined || duration === null || duration === '') {
    return null;
  }
  const seconds = typeof duration === 'number' ? duration : Number.parseFloat(duration);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return Math.round(seconds * 1000);
};
