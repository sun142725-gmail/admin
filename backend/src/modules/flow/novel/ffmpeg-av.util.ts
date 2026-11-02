// 音画合成 ffmpeg 命令构建纯函数：每镜混流 / concat 清单 / BGM ducking / loudnorm / 视觉步 / 多规格映射。
import { basename, dirname } from 'path';
// 纪律（对齐 subtitle.util.ts）：全部导出为纯函数，string[] 构参无 IO；执行层薄封装在
// novel-pipeline.service.ts（execFileAsync），保证命令构建可离线单测（AGENTS 规则 1/4）。
//
// 关键实测依据（/tmp/avfix，本机 ffmpeg 9.0.2，见方案评审修正点）：
// ① amix 输入顺序必须 [voice][duck]：原式 [duck][voice]amix=duration=first 在 BGM 短于语音时
//    输出 4.000000s（配音尾部丢失），修正式输出 5.230000s 完整；
// ② loudnorm 不带 -ar 会输出 96000 Hz（部分浏览器/微信内嵌播放器不支持），显式 -ar 44100 -ac 2；
// ③ mux 步 scale+pad 统一分辨率：上游不守 videoSize 时段间分辨率不一致，concat -c copy 对
//    H264 SPS 变化可能 exit 0 但成片花屏——在 mux 步即统一，根治 SPS 风险。

export type NovelAspect = '16:9' | '9:16' | '1:1';

export interface AspectSizes {
  // 生图端尺寸（GenerateImageDto 枚举内）。
  imageSize: string;
  // 合成端视频目标宽高（mux / 视觉步 scale+pad 共用）。
  videoWidth: number;
  videoHeight: number;
}

/**
 * 多规格画幅 → 尺寸映射。未知值/缺省返回 null（调用方回落现 imageSize/videoSize 行为，旧项目零变化）。
 * 生图 16:9→1792x1024 / 9:16→1024x1792 / 1:1→1024x1024；视频与合成端 1280 基对齐现默认 videoSize。
 */
export const resolveSizeByAspect = (aspect: string | undefined | null): AspectSizes | null => {
  switch (aspect) {
    case '16:9':
      return { imageSize: '1792x1024', videoWidth: 1280, videoHeight: 720 };
    case '9:16':
      return { imageSize: '1024x1792', videoWidth: 720, videoHeight: 1280 };
    case '1:1':
      return { imageSize: '1024x1024', videoWidth: 720, videoHeight: 720 };
    default:
      return null;
  }
};

/** 视频端尺寸串便捷形式（"1280x720" 等）；未知值/缺省返回 null（调用方回落 videoSize）。 */
export const resolveVideoSize = (aspect: string | undefined | null): string | null => {
  const size = resolveSizeByAspect(aspect);
  return size ? `${size.videoWidth}x${size.videoHeight}` : null;
};

export interface ShotMuxOptions {
  // 配音音频实测时长毫秒（shot.audioDurationMs）；null/<=0 时不传 -t，改用 -shortest 以音频流结束为准。
  audioDurationMs?: number | null;
  width: number;
  height: number;
}

/**
 * 每镜混流构参：视频 + 配音 → 统一编码（libx264/aac 44100 stereo）、统一分辨率、以音频时长为准的段。
 * - filter_complex：scale+pad 统一分辨率 + setsar=1；
 * - 有音频时前置 tpad 克隆末帧补长（stop_duration=600 上限）+ 输出 -t 截断实现「音频为准」：
 *   音频长→克隆末帧补齐 / 视频长→截断 / 相等→同式，三边界统一一条命令，无需预 probe 视频时长；
 *   （注意 tpad 产物依赖 -t 截断，不能与 -shortest 组合——tpad 会把视频流拉长到 stop_duration，
 *   -shortest 等不到「最短流」先结束，实测会输出 600s+）；
 * - 无音频分支：anullsrc 静音轨占位 + -shortest（[v] 为有限流先结束，输出=视频原长）。
 *   统一 aac 44100 stereo 是 concat 直拷前提，缺流断链；
 * - 输出 -t 取整毫秒秒值（Math.round(ms)/1000）。
 */
export const buildShotMuxArgs = (
  videoPath: string,
  audioPath: string | null,
  outPath: string,
  options: ShotMuxOptions
): string[] => {
  const { audioDurationMs, width, height } = options;
  const args: string[] = ['-y', '-i', videoPath];
  if (audioPath) {
    args.push('-i', audioPath);
  } else {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  }
  // tpad 仅在「音频为准」场景需要（音频可能长于视频才补帧）；无音频时视频流即最短有限流。
  const tpad = audioPath ? 'tpad=stop_mode=clone:stop_duration=600,' : '';
  args.push(
    '-filter_complex',
    `[0:v]${tpad}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v]`,
    '-map',
    '[v]',
    '-map',
    '1:a'
  );
  if (audioPath && audioDurationMs != null && audioDurationMs > 0) {
    args.push('-t', String(Math.round(audioDurationMs) / 1000));
  } else {
    // 时长未知（防御）/无音频：以最短流为准。
    args.push('-shortest');
  }
  args.push(
    '-r',
    '24',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    outPath
  );
  return args;
};

/**
 * concat demuxer 清单内容：file 指令单引号转义（沿用 novel-pipeline.service mergeVideos 旧规则：
 * 路径内单引号 → '\'' ，ffmpeg 对清单文件逐行解析）。
 */
export const buildConcatListContent = (absolutePaths: string[]): string =>
  (absolutePaths ?? []).map((path) => `file '${(path ?? '').replace(/'/g, "'\\''")}'`).join('\n');

/**
 * BGM ducking 混音构参（侧链压缩：人声触发 BGM 压低）。
 * amix 输入顺序实测修正为 [voice][duck]：duration=first 以语音轨为准（BGM 短于语音时尾部为
 * 纯语音（BGM 提前结束），语音完整；BGM 长于语音时被截断）。dropout_transition=0 防止 amix
 * 在某输入结束时缓慢淡出；normalize=0 保留原响度（响度统一交给 loudnorm 步）。
 * 选 sidechaincompress 而非逐帧 volume 包络：本机 ffmpeg 9.0.2 实测滤镜可用且免逐帧包络。
 * -c:v copy 不动视频；音频统一 aac 44100 stereo。
 */
export const buildBgmMixArgs = (videoPath: string, bgmPath: string, outPath: string, bgmVolume = 0.2): string[] => [
  '-y',
  '-i',
  videoPath,
  '-i',
  bgmPath,
  '-filter_complex',
  `[1:a]volume=${bgmVolume}[bgm];[0:a]asplit=2[sc][voice];[bgm][sc]sidechaincompress=threshold=0.05:ratio=8:attack=100:release=800[duck];[voice][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`,
  '-map',
  '0:v',
  '-map',
  '[mix]',
  '-c:v',
  'copy',
  '-c:a',
  'aac',
  '-ar',
  '44100',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
  outPath
];

/**
 * loudnorm 响度统一构参：单遍动态模式（两遍测量更准但耗时翻倍，短视频取舍单遍）。
 * 实测依据：不带 -ar 44100 输出 96000 Hz（本机 9.0.2，部分浏览器/微信内嵌播放器不支持），
 * 显式 -c:a aac -ar 44100 -ac 2；-c:v copy 不重编码。
 */
export const buildLoudnormArgs = (inPath: string, outPath: string): string[] => [
  '-y',
  '-i',
  inPath,
  '-af',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-c:v',
  'copy',
  '-c:a',
  'aac',
  '-ar',
  '44100',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
  outPath
];

/**
 * 视觉步（无字幕烧录）构参：scale+pad+setsar 幂等保护链（mux 步已统一分辨率时 scale 无实际变化）。
 * 音频 -c:a copy（上游已是 aac 44100 stereo），重编码只动视频。
 */
export const buildScalePadArgs = (inPath: string, outPath: string, size: { width: number; height: number }): string[] => [
  '-y',
  '-i',
  inPath,
  '-vf',
  `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
  '-r',
  '24',
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'copy',
  '-movflags',
  '+faststart',
  outPath
];

// ---------- 字幕烧录（B 模块） ----------

/**
 * subtitles 滤镜 filename 转义：反斜杠 → 双反斜杠、单引号 → \'、冒号 → \:（顺序先反斜杠再引号再冒号）。
 * execFile 直传 argv 无 shell，不做 shell 引号处理；转义只服务 ffmpeg filtergraph 解析器。
 */
export const escapeSubtitlePath = (path: string): string =>
  (path ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');

/**
 * 字幕样式预设档 → ASS force_style 串（参数为经验值，可按需调整）。
 * 白字黑边 PrimaryColour=&H00FFFFFF / OutlineColour=&H00000000；
 * none 返回 null（不烧录字幕）。
 */
export const subtitleStylePreset = (style: string | undefined | null): string | null => {
  switch (style) {
    case 'big':
      return 'Fontsize=34,Outline=2,MarginV=30,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000';
    case 'none':
      return null;
    case 'default':
    case undefined:
    case null:
    case '':
      return 'Fontsize=20,Outline=1,MarginV=25,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000';
    default:
      // 未知样式按 default 处理（向后兼容）。
      return 'Fontsize=20,Outline=1,MarginV=25,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000';
  }
};

export interface SubtitleFontHints {
  // 字体目录（NOVEL_SUBTITLE_FONT_FILE 所在目录），注入 subtitles 滤镜 fontsdir。
  fontsdir?: string;
  // 字体名（文件名去扩展名），libass 按 fontsdir 内文件名匹配，注入 force_style FontName。
  fontName?: string;
}

/**
 * 字体配置推导：NOVEL_SUBTITLE_FONT_FILE → fontsdir=所在目录 + FontName=文件名去扩展名。
 * 缺省（未配置环境变量）返回空对象——不传 fontsdir，交给 fontconfig 兜底。
 */
export const subtitleFontHints = (fontFile: string | undefined | null): SubtitleFontHints => {
  const input = (fontFile ?? '').trim();
  if (!input) {
    return {};
  }
  const dir = dirname(input);
  const base = basename(input);
  const name = base.replace(/\.[^.]+$/, '');
  const hints: SubtitleFontHints = {};
  if (dir && dir !== '.') {
    hints.fontsdir = dir;
  }
  if (name) {
    hints.fontName = name;
  }
  return hints;
};

/**
 * 字幕烧录构参：vf 链 = scale+pad+setsar+subtitles 合并一条链（字幕烧录与 scale+pad 都必须
 * 重编码视频，合并避免两次全片重编码）。none 预设跳过 subtitles 滤镜段（退化为 scale+pad 链）。
 * fontsdir/FontName 仅在有 NOVEL_SUBTITLE_FONT_FILE 时注入（缺省交 fontconfig）。
 * 音频 -c:a copy 不动。
 */
export const buildSubtitleBurnArgs = (
  inPath: string,
  srtPath: string,
  outPath: string,
  size: { width: number; height: number },
  style?: string | null,
  fontFile?: string | null
): string[] => {
  const vfParts = [
    `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease`,
    `pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1'
  ];
  const preset = subtitleStylePreset(style);
  if (preset) {
    const hints = subtitleFontHints(fontFile);
    const styleBody = hints.fontName ? `FontName=${hints.fontName},${preset}` : preset;
    const filterParts = [`subtitles=${escapeSubtitlePath(srtPath)}`];
    if (hints.fontsdir) {
      filterParts.push(`fontsdir=${escapeSubtitlePath(hints.fontsdir)}`);
    }
    filterParts.push(`force_style='${styleBody}'`);
    vfParts.push(filterParts.join(':'));
  }
  return [
    '-y',
    '-i',
    inPath,
    '-vf',
    vfParts.join(','),
    '-r',
    '24',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    outPath
  ];
};
