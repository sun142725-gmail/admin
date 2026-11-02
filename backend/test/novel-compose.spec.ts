// 小说成片合成集成 e2e：ffmpeg lavfi 合成素材（color 视频流 + sine 音频流）离线真跑合成链
// （mux → concat → BGM ducking → 字幕烧录 → loudnorm），全程不依赖网络与 AI 额度（AGENTS 规则 4）。
// 覆盖（对齐方案评审修正点的防回归断言）：
// ① mux 链：ffprobe 断言含音轨 / 时长≈音频时长±100ms / 分辨率=映射值（含横转竖 720x1280）；
// ② concat 直拷：时长=段和；
// ③ BGM ducking：BGM 短于语音时输出音频流时长≈语音时长（本会话实测 4.0s BGM+5.23s 语音→修正式 5.23s，
//    原式 [duck][voice] 会丢配音尾部）；
// ④ loudnorm 输出 sample_rate=44100（不带 -ar 实测输出 96000）；
// ⑤ service 级 composeProjectFinal：预置错误时长 muxed_file 行，断言成片时长=重新 mux 实测段之和
//    （muxed_file 失效语义：绝不作为合成输入）与 SRT 时间轴一致；
// ⑥ 字幕烧录：本机 ffmpeg 带 libass（probeSubtitleFilter=true）才真跑，否则 skip。
// 本机无 ffmpeg 时整个套件 describe.skip（环境性失败可移植，AGENTS 规则 3）。
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NovelProject } from '../src/common/entities/novel-project.entity';
import { NovelShot } from '../src/common/entities/novel-shot.entity';
import { NovelPipelineService, probeSubtitleFilter } from '../src/modules/flow/novel/novel-pipeline.service';
import {
  buildBgmMixArgs,
  buildConcatListContent,
  buildLoudnormArgs,
  buildShotMuxArgs
} from '../src/modules/flow/novel/ffmpeg-av.util';

const execFileAsync = promisify(execFile);

const hasBinary = (bin: string): boolean => spawnSync(bin, ['-version'], { timeout: 5000 }).status === 0;
const hasFfmpeg = hasBinary('ffmpeg');

/** 毫秒 → SRT HH:MM:SS,mmm（与 subtitle.util.formatSrtTime 同口径，本地实现避免测试内再导出依赖）。 */
const formatSrtTime = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms));
  const millis = total % 1000;
  const totalSeconds = Math.floor(total / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
};

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  sample_rate?: string;
}

const probeStreams = async (absolutePath: string): Promise<{ streams: ProbeStream[]; formatDuration: number | null }> => {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', absolutePath],
    { timeout: 15000 }
  );
  const parsed = JSON.parse(stdout) as { streams?: ProbeStream[]; format?: { duration?: string } };
  const formatDuration = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : null;
  return { streams: parsed.streams ?? [], formatDuration: formatDuration != null && Number.isFinite(formatDuration) ? formatDuration : null };
};

const audioStream = (streams: ProbeStream[]): ProbeStream | undefined => streams.find((stream) => stream.codec_type === 'audio');
const videoStream = (streams: ProbeStream[]): ProbeStream | undefined => streams.find((stream) => stream.codec_type === 'video');

// 素材目录（uploads 内，sanitizeImageRelative 限根校验可通过）。
const ASSET_REL = 'novel-video/testassets';
const ASSET_DIR = join(process.cwd(), 'uploads', ASSET_REL);

(hasFfmpeg ? describe : describe.skip)('Novel AV compose (e2e, lavfi 离线真跑)', () => {
  let app: INestApplication;
  let service: NovelPipelineService;
  let projectRepo: Repository<NovelProject>;
  let shotRepo: Repository<NovelShot>;
  const createdProjectIds: number[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test_access';
    process.env.JWT_REFRESH_SECRET = 'test_refresh';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.SEED = 'false';
    process.env.AI_ENCRYPTION_KEY = 'e2e-encryption-key';

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    // composeProjectFinal 为 service 直调（不走 HTTP），无需登录/权限种子。
    service = moduleFixture.get(NovelPipelineService);
    projectRepo = moduleFixture.get<Repository<NovelProject>>(getRepositoryToken(NovelProject));
    shotRepo = moduleFixture.get<Repository<NovelShot>>(getRepositoryToken(NovelShot));

    // lavfi 素材：2s 720x480 横屏无声视频 + 三段正弦音频（短/长/BGM）。
    await mkdir(ASSET_DIR, { recursive: true });
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=720x480:d=2:r=24', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', join(ASSET_DIR, 'clip.mp4')],
      { timeout: 60000 }
    );
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', '-c:a', 'pcm_s16le', join(ASSET_DIR, 'voice-short.wav')],
      { timeout: 30000 }
    );
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3.2', '-c:a', 'pcm_s16le', join(ASSET_DIR, 'voice-long.wav')],
      { timeout: 30000 }
    );
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1', '-c:a', 'pcm_s16le', join(ASSET_DIR, 'bgm.wav')],
      { timeout: 30000 }
    );
    // BGM 走项目配置 bgmUrl（/uploads/novel-bgm/...），同样 lavfi 离线生成。
    await mkdir(join(process.cwd(), 'uploads', 'novel-bgm'), { recursive: true });
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', '-c:a', 'pcm_s16le', join(process.cwd(), 'uploads', 'novel-bgm', 'bgm-e2e.wav')],
      { timeout: 30000 }
    );
  }, 120000);

  afterAll(async () => {
    await app.close();
    // 测试产物清理（素材 + 各项目合成产物目录）。
    await rm(ASSET_DIR, { recursive: true, force: true });
    await rm(join(process.cwd(), 'uploads', 'novel-bgm', 'bgm-e2e.wav'), { force: true });
    for (const projectId of createdProjectIds) {
      await rm(join(process.cwd(), 'uploads', 'novel-video', `p${projectId}`), { recursive: true, force: true });
    }
  });

  const createProject = async (config: Partial<NovelProject['config']>): Promise<NovelProject> => {
    const project = await projectRepo.save(
      projectRepo.create({
        name: `合成项目-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sourceText: '第一章 测试\n合成链路验证。',
        status: 'completed',
        stage: 'merging',
        config: { shotsPerChapter: 3, videoSeconds: 5, imageSize: '1536x1024', videoSize: '1280x720', ...config },
        createdBy: 1
      })
    );
    createdProjectIds.push(project.id);
    return project;
  };

  const createShot = async (projectId: number, idx: number, fields: Partial<NovelShot>): Promise<NovelShot> => {
    const shot = await shotRepo.save(
      shotRepo.create({
        projectId,
        chapterId: 0,
        idx,
        scenePrompt: 'scene',
        motionPrompt: 'static shot',
        narration: fields.narration ?? `第${idx}镜旁白。`,
        status: 'video_done',
        videoFile: `${ASSET_REL}/clip.mp4`,
        ...fields
      })
    );
    return shot;
  };

  it('mux：音频短于视频 → -t 截断，时长≈音频±100ms、含 aac 音轨', async () => {
    const out = join(ASSET_DIR, 'mux-short.mp4');
    await execFileAsync(
      'ffmpeg',
      buildShotMuxArgs(join(ASSET_DIR, 'clip.mp4'), join(ASSET_DIR, 'voice-short.wav'), out, {
        audioDurationMs: 1200,
        width: 1280,
        height: 720
      }),
      { timeout: 60000 }
    );
    const { streams, formatDuration } = await probeStreams(out);
    expect(audioStream(streams)?.codec_name).toBe('aac');
    expect(videoStream(streams)?.codec_name).toBe('h264');
    expect(formatDuration).not.toBeNull();
    expect(Math.abs((formatDuration as number) - 1.2)).toBeLessThan(0.1);
  });

  it('mux：音频长于视频 → tpad 克隆补帧，时长≈音频±100ms；横转竖分辨率=720x1280', async () => {
    const out = join(ASSET_DIR, 'mux-long.mp4');
    await execFileAsync(
      'ffmpeg',
      buildShotMuxArgs(join(ASSET_DIR, 'clip.mp4'), join(ASSET_DIR, 'voice-long.wav'), out, {
        audioDurationMs: 3200,
        width: 720,
        height: 1280
      }),
      { timeout: 60000 }
    );
    const { streams, formatDuration } = await probeStreams(out);
    expect(audioStream(streams)?.codec_name).toBe('aac');
    const video = videoStream(streams);
    expect(video?.width).toBe(720);
    expect(video?.height).toBe(1280);
    expect(formatDuration).not.toBeNull();
    expect(Math.abs((formatDuration as number) - 3.2)).toBeLessThan(0.1);
  });

  it('mux：无音频 → anullsrc 静音轨占位，时长=视频原长（2s）', async () => {
    const out = join(ASSET_DIR, 'mux-mute.mp4');
    await execFileAsync(
      'ffmpeg',
      buildShotMuxArgs(join(ASSET_DIR, 'clip.mp4'), null, out, { audioDurationMs: null, width: 1280, height: 720 }),
      { timeout: 60000 }
    );
    const { streams, formatDuration } = await probeStreams(out);
    expect(audioStream(streams)?.codec_name).toBe('aac');
    expect(formatDuration).not.toBeNull();
    expect(Math.abs((formatDuration as number) - 2)).toBeLessThan(0.1);
  });

  it('concat 直拷：时长=段和（mux 步已统一编码/分辨率/音轨）', async () => {
    const seg1 = join(ASSET_DIR, 'concat-seg1.mp4');
    const seg2 = join(ASSET_DIR, 'concat-seg2.mp4');
    await execFileAsync(
      'ffmpeg',
      buildShotMuxArgs(join(ASSET_DIR, 'clip.mp4'), join(ASSET_DIR, 'voice-long.wav'), seg1, { audioDurationMs: 3200, width: 1280, height: 720 }),
      { timeout: 60000 }
    );
    await execFileAsync(
      'ffmpeg',
      buildShotMuxArgs(join(ASSET_DIR, 'clip.mp4'), join(ASSET_DIR, 'voice-short.wav'), seg2, { audioDurationMs: 1200, width: 1280, height: 720 }),
      { timeout: 60000 }
    );
    const listFile = join(ASSET_DIR, 'concat-e2e.txt');
    await writeFile(listFile, buildConcatListContent([seg1, seg2]), 'utf8');
    const out = join(ASSET_DIR, 'concat-e2e.mp4');
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out], { timeout: 60000 });
    const { formatDuration } = await probeStreams(out);
    expect(formatDuration).not.toBeNull();
    expect(Math.abs((formatDuration as number) - 4.4)).toBeLessThan(0.25);
  });

  it('BGM ducking 防回归：BGM(1s) 短于语音(3.2s) 时输出音频流时长≈语音时长（amix [voice][duck] 修正式）', async () => {
    const voice = join(ASSET_DIR, 'concat-voice.mp4');
    await execFileAsync(
      'ffmpeg',
      buildShotMuxArgs(join(ASSET_DIR, 'clip.mp4'), join(ASSET_DIR, 'voice-long.wav'), voice, { audioDurationMs: 3200, width: 1280, height: 720 }),
      { timeout: 60000 }
    );
    const out = join(ASSET_DIR, 'bgm-mix.mp4');
    await execFileAsync('ffmpeg', buildBgmMixArgs(voice, join(ASSET_DIR, 'bgm.wav'), out, 0.2), { timeout: 60000 });
    const { streams, formatDuration } = await probeStreams(out);
    const audio = audioStream(streams);
    expect(audio?.codec_name).toBe('aac');
    expect(audio?.sample_rate).toBe('44100');
    // 关键断言：语音 3.2s 完整保留（原式 [duck][voice] 此处只会输出 1s——BGM 提前结束时 amix 提前收尾）
    const audioDuration = audio?.duration ? Number.parseFloat(audio.duration) : null;
    expect(audioDuration).not.toBeNull();
    expect(Math.abs((audioDuration as number) - 3.2)).toBeLessThan(0.1);
    expect(formatDuration).not.toBeNull();
    expect(Math.abs((formatDuration as number) - 3.2)).toBeLessThan(0.1);
  });

  it('loudnorm 防回归：输出音轨 sample_rate=44100（不带 -ar 实测会输出 96000）', async () => {
    const inPath = join(ASSET_DIR, 'concat-voice.mp4');
    if (!existsSync(inPath)) {
      // 顺序执行兜底：上一用例产物存在（runInBand）；缺失则现场补一段。
      await execFileAsync(
        'ffmpeg',
        buildShotMuxArgs(join(ASSET_DIR, 'clip.mp4'), join(ASSET_DIR, 'voice-long.wav'), inPath, { audioDurationMs: 3200, width: 1280, height: 720 }),
        { timeout: 60000 }
      );
    }
    const out = join(ASSET_DIR, 'loudnorm-e2e.mp4');
    await execFileAsync('ffmpeg', buildLoudnormArgs(inPath, out), { timeout: 60000 });
    const { streams } = await probeStreams(out);
    expect(audioStream(streams)?.sample_rate).toBe('44100');
    expect(videoStream(streams)?.codec_name).toBe('h264'); // -c:v copy 视频未重编码
  });

  it('service.composeProjectFinal：9:16 多规格 + BGM + 字幕；预置错误时长 muxed_file 不影响成片；SRT=实测段时长', async () => {
    // 素材：音频 3.2s + 1.2s → 实测段和 ≈ 4.4s；videoSeconds=5 是错误基准（若走兜底 SRT 会是 10s）。
    const project = await createProject({
      aspect: '9:16',
      subtitleStyle: 'none',
      bgmUrl: '/uploads/novel-bgm/bgm-e2e.wav',
      bgmVolume: 0.2,
      videoSeconds: 5
    });
    const shot1 = await createShot(project.id, 1, {
      audioFile: `${ASSET_REL}/voice-long.wav`,
      audioDurationMs: 3200,
      narration: '第一镜旁白。'
    });
    const shot2 = await createShot(project.id, 2, {
      audioFile: `${ASSET_REL}/voice-short.wav`,
      audioDurationMs: 1200,
      narration: '第二镜旁白。'
    });
    // 预置一条「错误时长」的 muxed_file 行：指向 0.3s 的真小段——若 composeProjectFinal 误读该列
    // 作合成输入，成片时长会远离 4.4s（muxed_file 失效语义防回归）。
    const stale = join(ASSET_DIR, 'stale.mp4');
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=0.3:r=24', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', stale],
      { timeout: 60000 }
    );
    await shotRepo.update(shot1.id, { muxedFile: `${ASSET_REL}/stale.mp4` });

    const { finalPath, subtitlePath, bgmApplied } = await service.composeProjectFinal(project.id);

    expect(finalPath).toBe(`/uploads/novel-video/p${project.id}/final.mp4`);
    expect(subtitlePath).toBe(`/uploads/novel-video/p${project.id}/subtitle.srt`);
    expect(bgmApplied).toBe(true);

    // 成片：时长=重新 mux 实测段之和（3.2+1.2≈4.4），分辨率=9:16 映射 720x1280，含音轨。
    const finalAbsolute = join(process.cwd(), 'uploads', finalPath.replace(/^\/uploads\//, ''));
    const { streams, formatDuration } = await probeStreams(finalAbsolute);
    expect(videoStream(streams)?.width).toBe(720);
    expect(videoStream(streams)?.height).toBe(1280);
    expect(audioStream(streams)?.codec_name).toBe('aac');
    expect(formatDuration).not.toBeNull();
    expect(Math.abs((formatDuration as number) - 4.4)).toBeLessThan(0.3);

    // mux 后段实测（composeProjectFinal 的 mux-{id}.mp4）→ 与成片时长/SRT 对齐。
    const muxed1 = await probeStreams(join(process.cwd(), 'uploads', `novel-video/p${project.id}/mux-${shot1.id}.mp4`));
    const muxed2 = await probeStreams(join(process.cwd(), 'uploads', `novel-video/p${project.id}/mux-${shot2.id}.mp4`));
    const seg1Ms = Math.round((muxed1.formatDuration as number) * 1000);
    const seg2Ms = Math.round((muxed2.formatDuration as number) * 1000);
    expect(Math.abs(seg1Ms - 3200)).toBeLessThanOrEqual(100);
    expect(Math.abs(seg2Ms - 1200)).toBeLessThanOrEqual(100);

    // SRT 时间轴 = 实测段时长累加（第一段 0→seg1，第二段 seg1→seg1+seg2），与 videoSeconds 兜底(5s)无关。
    const srt = await readFile(join(process.cwd(), 'uploads', subtitlePath.replace(/^\/uploads\//, '')), 'utf8');
    expect(srt).toContain('1\n00:00:00,000 -->');
    expect(srt).toContain(`第二镜旁白。`);
    const seg1Timestamp = formatSrtTime(seg1Ms);
    const totalTimestamp = formatSrtTime(seg1Ms + seg2Ms);
    expect(srt).toContain(`${seg1Timestamp} --> ${totalTimestamp}`);
    // muxed_file 落库为探针（shot1 被重新 mux 覆盖为 mux-{id}.mp4，不再是 stale）
    const shot1After = await shotRepo.findOne({ where: { id: shot1.id } });
    expect(shot1After?.muxedFile).toBe(`novel-video/p${project.id}/mux-${shot1.id}.mp4`);
  }, 60000);

  it('字幕烧录（libass 主机真跑）：烧录后尺寸/时长不变', async () => {
    const burnable = await probeSubtitleFilter();
    if (!burnable) {
      // 无 libass 主机：跳过真跑（describe 内 cannot 条件 skip；方案指定 beforeAll 探测降级）。
      return;
    }
    const project = await createProject({
      aspect: '16:9',
      subtitleStyle: 'default',
      videoSeconds: 5
    });
    await createShot(project.id, 1, {
      audioFile: `${ASSET_REL}/voice-long.wav`,
      audioDurationMs: 3200,
      narration: '烧录字幕测试旁白。'
    });
    const { finalPath } = await service.composeProjectFinal(project.id);
    const finalAbsolute = join(process.cwd(), 'uploads', finalPath.replace(/^\/uploads\//, ''));
    const { streams, formatDuration } = await probeStreams(finalAbsolute);
    expect(videoStream(streams)?.width).toBe(1280);
    expect(videoStream(streams)?.height).toBe(720);
    expect(formatDuration).not.toBeNull();
    expect(Math.abs((formatDuration as number) - 3.2)).toBeLessThan(0.3);
  }, 60000);
});

