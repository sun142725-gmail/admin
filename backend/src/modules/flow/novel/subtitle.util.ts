// SRT 字幕纯函数：时间格式化 + 按顺序累加时间轴生成字幕正文。
// 只做字符串拼装，不做任何 IO（落盘在管线里），保持可单测。

/**
 * 毫秒 → SRT 时间戳 HH:MM:SS,mmm（毫秒与秒/分/小时逐级进位）。
 * 负数按 0 处理。
 */
export const formatSrtTime = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms));
  const millis = total % 1000;
  const totalSeconds = Math.floor(total / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
};

export interface SubtitleSegment {
  // 旁白文本（空/空白段仍占时长，但不产生字幕条目）。
  text: string;
  // 该段时长毫秒。口径：调用方传入「成片逐段实际时长」——composeProjectFinal 按 mux 后
  // ffprobe 实测段时长累加；regenerateSubtitle 走 muxed_file/video_file 实测回落，
  // 无产物时兜底 videoSeconds。由调用方决定；空文本段只推进时间轴不产出字幕。
  durationMs: number;
}

/**
 * 生成 SRT 字幕：按段顺序累加时间轴（start = 前段 end）。
 * 规则：空文本段只推进时间轴不产出字幕；时间轴毫秒取整避免浮点误差。
 */
export const buildSrt = (segments: SubtitleSegment[]): string => {
  const entries: string[] = [];
  let cursor = 0;
  for (const segment of segments ?? []) {
    const start = cursor;
    const end = start + Math.max(0, Math.floor(segment.durationMs ?? 0));
    cursor = end;
    const text = (segment.text ?? '').trim();
    if (!text) {
      continue;
    }
    entries.push(`${entries.length + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}`);
  }
  return entries.length > 0 ? `${entries.join('\n\n')}\n` : '';
};
