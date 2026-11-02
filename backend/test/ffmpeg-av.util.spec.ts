// ffmpeg-av.util 纯函数单测：全部构参断言，无 IO / 无 execFile（命令构建与执行层分离，AGENTS 规则 1/4）。
// 防回归锚点（/tmp/avfix 实测评审修正点，见 util 文件头）：
// ① BGM ducking amix 输入顺序必须 [voice][duck]（原式 [duck][voice] 在 BGM 短于语音时丢配音尾部）；
// ② loudnorm 必须显式 -c:a aac -ar 44100 -ac 2（不带 -ar 输出 96000 Hz）；
// ③ mux 构参必须含 scale+pad 统一分辨率（concat SPS 花屏根治）。
import {
  buildBgmMixArgs,
  buildConcatListContent,
  buildLoudnormArgs,
  buildScalePadArgs,
  buildShotMuxArgs,
  buildSubtitleBurnArgs,
  escapeSubtitlePath,
  resolveSizeByAspect,
  resolveVideoSize,
  subtitleFontHints,
  subtitleStylePreset
} from '../src/modules/flow/novel/ffmpeg-av.util';

describe('ffmpeg-av.util（纯函数构参）', () => {
  describe('resolveSizeByAspect：多规格映射', () => {
    it('三档映射：生图尺寸与合成端宽高', () => {
      expect(resolveSizeByAspect('16:9')).toEqual({ imageSize: '1792x1024', videoWidth: 1280, videoHeight: 720 });
      expect(resolveSizeByAspect('9:16')).toEqual({ imageSize: '1024x1792', videoWidth: 720, videoHeight: 1280 });
      expect(resolveSizeByAspect('1:1')).toEqual({ imageSize: '1024x1024', videoWidth: 720, videoHeight: 720 });
    });

    it('未知值/缺省回落 null（调用方回落 imageSize/videoSize 旧行为）', () => {
      expect(resolveSizeByAspect(undefined)).toBeNull();
      expect(resolveSizeByAspect(null)).toBeNull();
      expect(resolveSizeByAspect('4:3')).toBeNull();
      expect(resolveSizeByAspect('')).toBeNull();
      expect(resolveVideoSize('9:16')).toBe('720x1280');
      expect(resolveVideoSize(undefined)).toBeNull();
    });
  });

  describe('buildShotMuxArgs：每镜混流三态边界', () => {
    it('音频时长为准：构参含双输入、tpad+scale+pad 统一分辨率 vf、-t 截断与统一输出参数', () => {
      const args = buildShotMuxArgs('/u/seg.mp4', '/u/voice.mp3', '/u/out.mp4', {
        audioDurationMs: 2300,
        width: 1280,
        height: 720
      });
      // 输入：视频 + 配音（顺序固定，-map 1:a 依赖）
      expect(args.slice(0, 5)).toEqual(['-y', '-i', '/u/seg.mp4', '-i', '/u/voice.mp3']);
      // filter_complex：tpad 克隆补长 + scale+pad 统一分辨率（评审防回归：mux 步即统一）
      const filter = args[args.indexOf('-filter_complex') + 1];
      expect(filter).toBe(
        '[0:v]tpad=stop_mode=clone:stop_duration=600,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v]'
      );
      expect(args).toContain('-t');
      expect(args[args.indexOf('-t') + 1]).toBe('2.3');
      // 统一输出参数（concat 直拷前提：同编码/同帧率/同采样率）
      expect(args[args.indexOf('-r') + 1]).toBe('24');
      expect(args).toEqual(
        expect.arrayContaining(['-map', '[v]', '-map', '1:a', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'])
      );
      expect(args[args.length - 1]).toBe('/u/out.mp4');
      expect(args).not.toContain('-shortest');
    });

    it('横转竖 720x1280：scale+pad 目标为竖屏（评审实测用例构参）', () => {
      const args = buildShotMuxArgs('/u/land.mp4', '/u/voice.mp3', '/u/out.mp4', {
        audioDurationMs: 800,
        width: 720,
        height: 1280
      });
      const filter = args[args.indexOf('-filter_complex') + 1];
      expect(filter).toContain('scale=720:1280:force_original_aspect_ratio=decrease');
      expect(filter).toContain('pad=720:1280:(ow-iw)/2:(oh-ih)/2');
    });

    it('视频长于音频 / 相等：同一条命令式（仅 -t 值不同），无需预 probe 视频时长', () => {
      const shorter = buildShotMuxArgs('/v.mp4', '/a.mp3', '/o.mp4', { audioDurationMs: 500, width: 1280, height: 720 });
      const equal = buildShotMuxArgs('/v.mp4', '/a.mp3', '/o.mp4', { audioDurationMs: 5000, width: 1280, height: 720 });
      expect(shorter[shorter.indexOf('-t') + 1]).toBe('0.5');
      expect(equal[equal.indexOf('-t') + 1]).toBe('5');
      // 除 -t 值外构参完全一致（三边界统一）
      const stripT = (args: string[]) => args.filter((part) => part !== '0.5' && part !== '5');
      expect(stripT(shorter)).toEqual(stripT(equal));
    });

    it('无音频分支：anullsrc 静音轨 + -shortest，无 tpad（tpad 拉长流会让 -shortest 等不到最短流）', () => {
      const args = buildShotMuxArgs('/v.mp4', null, '/o.mp4', { audioDurationMs: null, width: 1280, height: 720 });
      const anullIndex = args.indexOf('anullsrc=r=44100:cl=stereo');
      expect(anullIndex).toBeGreaterThan(-1);
      expect(args[anullIndex - 1]).toBe('-i');
      expect(args[anullIndex - 2]).toBe('lavfi');
      expect(args).toContain('-shortest');
      expect(args).not.toContain('-t');
      const filter = args[args.indexOf('-filter_complex') + 1];
      expect(filter).not.toContain('tpad');
      expect(filter).toContain('scale=1280:720:force_original_aspect_ratio=decrease');
      expect(args).toContain('-map');
      expect(args[args.indexOf('-map') + 1]).toBe('[v]');
      // 音轨仍映射（anullsrc 占位）
      expect(args[args.indexOf('1:a') - 1]).toBe('-map');
    });

    it('有音频但 audioDurationMs=null（防御）：保留 tpad + -shortest（音频有限流先结束，输出=音频时长）', () => {
      const args = buildShotMuxArgs('/v.mp4', '/a.mp3', '/o.mp4', { audioDurationMs: null, width: 1280, height: 720 });
      expect(args).toContain('-shortest');
      expect(args).not.toContain('-t');
      expect(args[args.indexOf('-filter_complex') + 1]).toContain('tpad=stop_mode=clone:stop_duration=600');
    });
  });

  describe('buildConcatListContent：file 指令单引号转义', () => {
    it('普通路径逐行 file 指令', () => {
      expect(buildConcatListContent(['/a/1.mp4', '/a/2.mp4'])).toBe("file '/a/1.mp4'\nfile '/a/2.mp4'");
    });

    it("路径含单引号：转义为 '\\'（沿用旧 mergeVideos 规则）", () => {
      expect(buildConcatListContent(["/a/it's.mp4"])).toBe("file '/a/it'\\''s.mp4'");
      expect(buildConcatListContent([])).toBe('');
    });
  });

  describe('buildBgmMixArgs：ducking 链（评审防回归）', () => {
    it('amix 输入顺序必须 [voice][duck] 且 duration=first:dropout_transition=0:normalize=0', () => {
      const args = buildBgmMixArgs('/u/concat.mp4', '/u/bgm.mp3', '/u/out.mp4', 0.2);
      const filter = args[args.indexOf('-filter_complex') + 1];
      // 修正式链路（原式 [duck][voice] 输出 4.000000s 丢配音尾部，实测修正为 5.230000s）
      expect(filter).toBe(
        '[1:a]volume=0.2[bgm];[0:a]asplit=2[sc][voice];[bgm][sc]sidechaincompress=threshold=0.05:ratio=8:attack=100:release=800[duck];[voice][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]'
      );
      expect(args[args.indexOf('-map') + 1]).toBe('0:v');
      expect(args[args.indexOf('[mix]') - 1]).toBe('-map');
      expect(args).toContain('-c:v');
      expect(args[args.indexOf('-c:v') + 1]).toBe('copy');
    });

    it('音量参数注入与默认值 0.2', () => {
      expect(buildBgmMixArgs('/v', '/b', '/o').some((part) => part.includes('volume=0.2'))).toBe(true);
      expect(buildBgmMixArgs('/v', '/b', '/o', 0.5).some((part) => part.includes('volume=0.5'))).toBe(true);
      expect(buildBgmMixArgs('/v', '/b', '/o', 0).some((part) => part.includes('volume=0['))).toBe(true);
    });
  });

  describe('buildLoudnormArgs：响度统一（评审防回归）', () => {
    it('单遍 loudnorm + 显式 -c:a aac -ar 44100 -ac 2 + -c:v copy', () => {
      const args = buildLoudnormArgs('/u/in.mp4', '/u/final.mp4');
      expect(args[args.indexOf('-af') + 1]).toBe('loudnorm=I=-16:TP=-1.5:LRA=11');
      expect(args).toEqual(expect.arrayContaining(['-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-ac', '2']));
      expect(args[args.length - 1]).toBe('/u/final.mp4');
    });
  });

  describe('buildScalePadArgs：视觉步幂等保护', () => {
    it('三档尺寸 scale+pad+setsar 链，音频 copy', () => {
      for (const [width, height] of [[1280, 720], [720, 1280], [720, 720]] as const) {
        const args = buildScalePadArgs('/in.mp4', '/out.mp4', { width, height });
        expect(args[args.indexOf('-vf') + 1]).toBe(
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`
        );
        expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
        expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-pix_fmt', 'yuv420p']));
      }
    });
  });

  describe('escapeSubtitlePath：subtitles 滤镜 filename 转义', () => {
    it('冒号/单引号/反斜杠按序转义（先反斜杠再引号再冒号）', () => {
      expect(escapeSubtitlePath('/a/b.srt')).toBe('/a/b.srt');
      expect(escapeSubtitlePath('C:\\dir\\a: b.srt')).toBe('C\\:\\\\dir\\\\a\\: b.srt'); // 盘符冒号同样转义
      expect(escapeSubtitlePath("/a/it's.srt")).toBe("/a/it\\'s.srt");
      expect(escapeSubtitlePath('/a/b c.srt')).toBe('/a/b c.srt'); // 空格无需转义（无 shell）
    });
  });

  describe('subtitleStylePreset：三档预设', () => {
    it('default/big/none 与未知值回落', () => {
      expect(subtitleStylePreset('default')).toBe('Fontsize=20,Outline=1,MarginV=25,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000');
      expect(subtitleStylePreset('big')).toBe('Fontsize=34,Outline=2,MarginV=30,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000');
      expect(subtitleStylePreset('none')).toBeNull();
      expect(subtitleStylePreset(undefined)).toBe(subtitleStylePreset('default'));
      expect(subtitleStylePreset('unknown')).toBe(subtitleStylePreset('default'));
    });
  });

  describe('subtitleFontHints：字体推导', () => {
    it('fontfile → fontsdir=所在目录 + FontName=去扩展名', () => {
      expect(subtitleFontHints('/usr/share/fonts/NotoSansCJK-Regular.ttc')).toEqual({
        fontsdir: '/usr/share/fonts',
        fontName: 'NotoSansCJK-Regular'
      });
    });

    it('缺省不注入（交 fontconfig）', () => {
      expect(subtitleFontHints(undefined)).toEqual({});
      expect(subtitleFontHints(null)).toEqual({});
      expect(subtitleFontHints('')).toEqual({});
    });
  });

  describe('buildSubtitleBurnArgs：vf 链合并', () => {
    it('scale+pad+setsar+subtitles 合并一条链，force_style 注入', () => {
      const args = buildSubtitleBurnArgs('/in.mp4', '/a/b.srt', '/out.mp4', { width: 720, height: 1280 }, 'default');
      const vf = args[args.indexOf('-vf') + 1];
      expect(vf).toBe(
        "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,subtitles=/a/b.srt:force_style='Fontsize=20,Outline=1,MarginV=25,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'"
      );
      expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
    });

    it('fontsdir/FontName 仅在有 fontFile 时注入', () => {
      const withFont = buildSubtitleBurnArgs('/in.mp4', '/a/b.srt', '/o.mp4', { width: 1280, height: 720 }, 'big', '/f/dir/MyFont.ttf');
      const vf = withFont[withFont.indexOf('-vf') + 1];
      expect(vf).toContain('subtitles=/a/b.srt:fontsdir=/f/dir:force_style=\'FontName=MyFont,Fontsize=34');
      const withoutFont = buildSubtitleBurnArgs('/in.mp4', '/a/b.srt', '/o.mp4', { width: 1280, height: 720 }, 'default', null);
      expect(withoutFont[withoutFont.indexOf('-vf') + 1]).not.toContain('fontsdir');
      expect(withoutFont[withoutFont.indexOf('-vf') + 1]).not.toContain('FontName');
    });

    it('none 预设跳过 subtitles 滤镜段（退化为 scale+pad 链）', () => {
      const args = buildSubtitleBurnArgs('/in.mp4', '/a/b.srt', '/o.mp4', { width: 1280, height: 720 }, 'none');
      const vf = args[args.indexOf('-vf') + 1];
      expect(vf).not.toContain('subtitles');
      expect(vf).toContain('scale=1280:720');
    });

    it('SRT 路径含冒号/单引号时走 escapeSubtitlePath', () => {
      const args = buildSubtitleBurnArgs('/in.mp4', "/a/it's 1.srt", '/o.mp4', { width: 1280, height: 720 }, 'default');
      expect(args[args.indexOf('-vf') + 1]).toContain("subtitles=/a/it\\'s 1.srt");
    });
  });
});
