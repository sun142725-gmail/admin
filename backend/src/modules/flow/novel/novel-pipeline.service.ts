// 小说转视频流水线：分片 → 逐章 LLM 分镜 → 逐分镜出图出视频 → ffmpeg 合成成片。
// 断点续跑：已完成的章节/分镜自动复用；支持取消；产物落盘 uploads/novel-video/{projectId}/。
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { Repository, In } from 'typeorm';
import { NovelProject, NovelPipelineConfig, DEFAULT_NOVEL_CONFIG } from '../../../common/entities/novel-project.entity';
import { NovelChapter } from '../../../common/entities/novel-chapter.entity';
import { NovelShot } from '../../../common/entities/novel-shot.entity';
import { CharacterCard } from '../../../common/entities/character-card.entity';
import { ModelRouterService } from '../../ai/core/model-router.service';
import { UsageLogService } from '../../ai/core/usage-log.service';
import { ChatMessagePayload } from '../../ai/core/llm-adapter.interface';
import { VideoUpstreamService } from '../engine/video-upstream.service';
import { NodeHandlerDependencies, parseJsonBlock, runLlm } from '../engine/node-handlers';
import { estimateSpeechMs, normalizeTtsText, parseFfprobeDuration } from '../engine/tts.util';
import { buildSrt } from './subtitle.util';
import { composeShotImagePrompt, composeShotMotionPrompt } from './shot-prompt.util';
import { readImageAsDataUrl } from './character-ref.util';
import { splitChapterText } from './chapter-split.util';
import { CreateCharacterCardDto, UpdateCharacterCardDto } from './character-card.dto';
import { UpdateShotDto } from './novel-video.dto';

const execFileAsync = promisify(execFile);
const UPLOAD_ROOT = join(process.cwd(), 'uploads', 'novel-video');
// 章节内容送入 LLM 的长度上限（超出截断，避免上下文溢出）。
const CHAPTER_CONTEXT_LIMIT = 3000;

// ---------- 模块级导出：供控制器/e2e 复用的互斥与二进制探测 ----------

/** 项目级互斥断言：运行中的项目禁止单镜编辑/重规划/重生成（与 run/cancel 共用 active 集合）。 */
export const assertProjectIdle = (active: Set<number>, projectId: number): void => {
  if (active.has(projectId)) {
    throw new BadRequestException('项目正在运行中，请等待完成或先取消');
  }
};

// ffmpeg/ffprobe 存在性探测缓存（Promise 记忆化）：合成与时长实测前各探测一次，失败结果也缓存。
let ffmpegProbe: Promise<boolean> | null = null;
let ffprobeProbe: Promise<boolean> | null = null;

/** 清空二进制探测缓存（仅测试用：模拟「未安装 ffmpeg」前后需要重置）。 */
export const resetBinaryProbeCache = (): void => {
  ffmpegProbe = null;
  ffprobeProbe = null;
};

const probeBinary = (bin: string, cached: Promise<boolean> | null): Promise<boolean> => {
  if (cached) {
    return cached;
  }
  return execFileAsync(bin, ['-version'])
    .then(() => true)
    .catch(() => false);
};

/** ffmpeg 是否可用（缓存）；不可用说明主机未安装，合成直接失败。 */
export const probeFfmpeg = (): Promise<boolean> => {
  ffmpegProbe = probeBinary('ffmpeg', ffmpegProbe);
  return ffmpegProbe;
};

/** 合成前置断言：主机未安装 ffmpeg 时抛出明确错误（而非 exec 报 ENOENT 谜语）。 */
export const assertFfmpegAvailable = async (): Promise<void> => {
  if (!(await probeFfmpeg())) {
    throw new Error('主机未安装 ffmpeg，无法合成视频，请先安装后重试');
  }
};

interface StoryboardShot {
  scenePrompt: string;
  motionPrompt: string;
  narration?: string;
}

@Injectable()
export class NovelPipelineService implements OnModuleDestroy {
  private readonly logger = new Logger(NovelPipelineService.name);
  private readonly active = new Set<number>();
  private readonly cancelRequests = new Set<number>();

  private readonly deps: NodeHandlerDependencies;

  constructor(
    @InjectRepository(NovelProject) private readonly projectRepo: Repository<NovelProject>,
    @InjectRepository(NovelChapter) private readonly chapterRepo: Repository<NovelChapter>,
    @InjectRepository(NovelShot) private readonly shotRepo: Repository<NovelShot>,
    @InjectRepository(CharacterCard) private readonly characterRepo: Repository<CharacterCard>,
    router: ModelRouterService,
    usageLog: UsageLogService,
    private readonly video: VideoUpstreamService
  ) {
    this.deps = { router, usageLog, video };
  }

  onModuleDestroy() {
    this.cancelRequests.clear();
    this.active.clear();
  }

  // ---------- 分片 ----------

  /** 章节切分：优先按「第X章/回/节」标题正则，无标题时按段落长度切（实现委托纯函数，便于离线单测）。 */
  splitText(text: string): Array<{ idx: number; title: string; content: string }> {
    return splitChapterText(text);
  }

  async reSplit(projectId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (this.active.has(projectId)) {
      throw new BadRequestException('项目正在运行中，请先取消');
    }
    await this.clearArtifacts(projectId);
    await this.persistChapters(projectId, project.sourceText);
    await this.projectRepo.update(projectId, { stage: 'split', stageMessage: null, finalVideoPath: null });
    return this.detail(projectId);
  }

  private async persistChapters(projectId: number, text: string) {
    const slices = this.splitText(text);
    await this.chapterRepo.delete({ projectId });
    await this.shotRepo.delete({ projectId });
    const entities = await this.chapterRepo.save(
      slices.map((slice) => this.chapterRepo.create({ projectId, ...slice, status: 'pending' }))
    );
    return entities;
  }

  // ---------- 运行 ----------

  /** 一键运行前预检：三类能力模型是否齐备，缺了直接报清单。 */
  private async precheck(): Promise<void> {
    const missing: string[] = [];
    for (const capability of ['chat', 'image', 'video']) {
      const candidates = await this.deps.router.candidatesByCapability(capability);
      if (candidates.length === 0) {
        missing.push(capability);
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException(`缺少 ${missing.join('/')} 能力模型，请先在 AI 模型管理里配置`);
    }
  }

  async run(userId: number, projectId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (this.active.has(projectId)) {
      throw new BadRequestException('项目正在运行中');
    }
    await this.precheck();
    this.cancelRequests.delete(projectId);
    this.active.add(projectId);
    await this.projectRepo.update(projectId, {
      status: 'running',
      stage: 'storyboard',
      error: null,
      startedAt: project.startedAt && project.status === 'running' ? project.startedAt : new Date(),
      finishedAt: null,
      durationMs: null
    });
    // fire-and-forget：进度全部落库，前端轮询。
    void this.pipeline(userId, projectId).catch(async (error: unknown) => {
      this.logger.error(`小说流水线 ${projectId} 异常: ${error instanceof Error ? error.message : error}`);
      await this.projectRepo.update(projectId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date()
      });
    });
    return { success: true };
  }

  async cancel(projectId: number) {
    if (this.active.has(projectId)) {
      this.cancelRequests.add(projectId);
      return { success: true, status: 'cancelling' };
    }
    await this.projectRepo.update(projectId, { status: 'cancelled', finishedAt: new Date() });
    return { success: true, status: 'cancelled' };
  }

  private cancelled(projectId: number): boolean {
    return this.cancelRequests.has(projectId);
  }

  private async pipeline(userId: number, projectId: number): Promise<void> {
    const startedAt = Date.now();
    try {
      const project = await this.projectRepo.findOne({ where: { id: projectId } });
      if (!project) {
        return;
      }
      // 1) 分镜：逐章生成（已 storyboarded 的章节跳过 = 断点续跑）。
      let chapters = await this.chapterRepo.find({ where: { projectId }, order: { idx: 'ASC' } });
      for (const chapter of chapters) {
        if (this.cancelled(projectId)) {
          throw new Error('用户取消');
        }
        if (chapter.status === 'storyboarded') {
          continue;
        }
        await this.projectRepo.update(projectId, {
          stageMessage: `分镜：第 ${chapter.idx}/${chapters.length} 章「${chapter.title}」`
        });
        try {
          const shots = await this.storyboardChapter(userId, project, chapter);
          await this.shotRepo.delete({ projectId, chapterId: chapter.id });
          await this.shotRepo.save(
            shots.map((shot, idx) =>
              this.shotRepo.create({
                projectId,
                chapterId: chapter.id,
                idx: idx + 1,
                scenePrompt: shot.scenePrompt,
                motionPrompt: shot.motionPrompt,
                narration: shot.narration ?? '',
                status: 'pending'
              })
            )
          );
          await this.chapterRepo.update(chapter.id, { status: 'storyboarded', error: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.chapterRepo.update(chapter.id, { status: 'failed', error: message });
          this.logger.warn(`章节 ${chapter.idx} 分镜失败: ${message}`); // 继续后续章节
        }
      }

      // 2) 配音：narration 非空且尚无音频的镜头逐个补配音。
      //    目标集只含 pending/image_done/failed；video_done 镜头绝不重配、不回退状态（保断点续跑语义）。
      await this.produceAudios(userId, project, projectId);

      // 3) 出图出视频：逐分镜顺序执行。
      chapters = await this.chapterRepo.find({ where: { projectId }, order: { idx: 'ASC' } });
      const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
      const shots = await this.shotRepo.find({ where: { projectId }, order: { id: 'ASC' } });
      const executable = shots.filter((shot) => shot.status !== 'video_done');
      const total = shots.length;
      let done = shots.filter((shot) => shot.status === 'video_done').length;
      // 角色注入素材整跑只读一次（跑片期间角色卡与参考图不会变化），避免逐镜重复 find + 读盘 + base64。
      const characterInputs = await this.collectCharacterInputs(projectId);
      await this.projectRepo.update(projectId, { stage: 'producing' });
      for (const shot of executable) {
        if (this.cancelled(projectId)) {
          throw new Error('用户取消');
        }
        const chapter = chapterById.get(shot.chapterId);
        await this.projectRepo.update(projectId, {
          stageMessage: `出片：第 ${done + 1}/${total} 个分镜（${chapter?.title ?? ''} #${shot.idx}）`
        });
        const startedShotAt = Date.now();
        try {
          // 首帧锁定：已有图且锁定时不重绘（单镜重生成同理，见 regenerateShot）。
          const imageUrl =
            shot.firstFrameLocked && shot.imageUrl
              ? shot.imageUrl
              : await this.produceImage(project, shot, characterInputs);
          await this.shotRepo.update(shot.id, { imageUrl, status: 'image_done', error: null });
          const videoFile = await this.produceVideo(userId, project, shot);
          await this.shotRepo.update(shot.id, {
            videoUrl: `/uploads/${videoFile}`,
            videoFile,
            status: 'video_done',
            error: null,
            durationMs: Date.now() - startedShotAt
          });
          done += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.shotRepo.update(shot.id, {
            status: 'failed',
            error: message,
            durationMs: Date.now() - startedShotAt
          });
          this.logger.warn(`分镜 ${shot.id} 出片失败: ${message}`); // 继续后续分镜
        }
      }

      // 4) 合成。
      const finalShots = await this.shotRepo.find({
        where: { projectId, status: 'video_done' },
        order: { id: 'ASC' }
      });
      if (finalShots.length === 0) {
        await this.projectRepo.update(projectId, {
          status: 'failed',
          stage: 'merging',
          error: '没有任何分镜成功出片，请检查模型配置后重跑',
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt
        });
        return;
      }
      await this.projectRepo.update(projectId, { stage: 'merging', stageMessage: `合成 ${finalShots.length} 段视频…` });
      // 字幕：按 concat 顺序（id ASC）生成 SRT 落盘；时间轴 = 分段视频时长（videoSeconds），与成片逐段对齐。
      const subtitlePath = await this.writeSubtitle(projectId, finalShots, project.config.videoSeconds);
      const finalPath = await this.mergeVideos(projectId, finalShots);
      const failedShots = (await this.shotRepo.count({ where: { projectId, status: 'failed' } })) ?? 0;
      const cancelledNow = this.cancelled(projectId);
      // 口径提示：成片当前为分段视频直拼，配音音轨未混入（音画混流属阶段2）；字幕时间轴按分段视频时长对齐。
      const synthNote = '成片为分段视频直拼（配音音轨混流属阶段2），字幕时间轴按分段视频时长对齐';
      await this.projectRepo.update(projectId, {
        status: cancelledNow ? 'cancelled' : 'completed',
        stage: 'done',
        stageMessage: failedShots > 0 ? `完成（${failedShots} 个分镜失败已跳过）；${synthNote}` : `全部完成；${synthNote}`,
        finalVideoPath: finalPath,
        finalSubtitlePath: subtitlePath,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt
      });
    } finally {
      this.active.delete(projectId);
      this.cancelRequests.delete(projectId);
    }
  }

  /** 单章分镜：LLM 输出 JSON 数组。 */
  private async storyboardChapter(
    userId: number,
    project: NovelProject,
    chapter: NovelChapter
  ): Promise<StoryboardShot[]> {
    const count = Math.min(Math.max(project.config.shotsPerChapter ?? 3, 1), 6);
    const system =
      '你是专业的短视频编导。把小说章节改编成指定数量的连续分镜。只输出 JSON，不要任何其他文字。' +
      '格式：{"shots":[{"scenePrompt":"英文首帧画面提示词，详细描述主体/场景/构图/光影","motionPrompt":"英文镜头运动与动态提示词","narration":"中文旁白或台词，30字以内"}]}';
    const user = [
      project.stylePrompt ? `全片风格要求：${project.stylePrompt}` : '',
      `分镜数量：${count}`,
      `章节标题：${chapter.title}`,
      '章节内容：',
      chapter.content.slice(0, CHAPTER_CONTEXT_LIMIT)
    ]
      .filter(Boolean)
      .join('\n');
    const messages: ChatMessagePayload[] = [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
    const { text } = await runLlm(this.deps, messages, {
      temperature: 0.7,
      userId,
      modelId: (project.config as { storyboardModelId?: number }).storyboardModelId
    });
    const parsed = parseJsonBlock(text) as { shots?: unknown } | undefined;
    const rawShots = Array.isArray(parsed?.shots) ? parsed?.shots : [];
    if (rawShots.length === 0) {
      throw new Error('分镜解析失败：LLM 未返回有效 shots');
    }
    return rawShots
      .slice(0, count)
      .map((raw) => raw as Partial<StoryboardShot>)
      .filter((raw) => typeof raw.scenePrompt === 'string' && typeof raw.motionPrompt === 'string')
      .map((raw) => ({
        scenePrompt: raw.scenePrompt as string,
        motionPrompt: raw.motionPrompt as string,
        narration: typeof raw.narration === 'string' ? raw.narration : ''
      }));
  }

  /**
   * 角色一致性注入素材：主角色优先的外观描述串与参考图 data URL（合计 ≤4 张）。
   * 读卡失败/无卡/读图失败均降级为空（warn 日志，不抛错）——不破坏断点续跑与旧行为。
   */
  private async collectCharacterInputs(projectId: number): Promise<{
    characterDescriptions: string[];
    referenceImages: string[];
  }> {
    let cards: CharacterCard[];
    try {
      cards = await this.characterRepo.find({
        where: { projectId },
        order: { isPrimary: 'DESC', sortOrder: 'ASC', id: 'ASC' }
      });
    } catch (error) {
      this.logger.warn(
        `项目 ${projectId} 角色卡读取失败，本次出图不注入角色: ${error instanceof Error ? error.message : error}`
      );
      return { characterDescriptions: [], referenceImages: [] };
    }
    if (cards.length === 0) {
      return { characterDescriptions: [], referenceImages: [] };
    }
    const characterDescriptions = cards.map((card) => {
      const appearance = (card.appearance ?? '').trim();
      return appearance ? `${card.name}: ${appearance}` : card.name;
    });
    // 参考图依卡序展开，逐张读盘转 data URL；非法/缺失跳过，全局截断 4 张（上游 edits 通道上限）。
    const referenceImages: string[] = [];
    for (const raw of cards.flatMap((card) => card.referenceImages ?? [])) {
      if (referenceImages.length >= 4) {
        break;
      }
      const dataUrl = await readImageAsDataUrl(raw);
      if (dataUrl) {
        referenceImages.push(dataUrl);
      } else {
        this.logger.warn(`项目 ${projectId} 角色参考图不可用已跳过: ${raw.slice(0, 120)}`);
      }
    }
    return { characterDescriptions, referenceImages };
  }

  /** 生成分镜首帧图并落盘，返回静态 URL。characterInputs 由整跑调用方预取传入（见 pipeline），缺省现查（单镜重生成路径）。 */
  private async produceImage(
    project: NovelProject,
    shot: NovelShot,
    characterInputs?: { characterDescriptions: string[]; referenceImages: string[] }
  ): Promise<string> {
    const candidates = await this.deps.router.candidatesByCapability('image');
    const usable = candidates.filter((candidate) => candidate.adapter.images);
    if (usable.length === 0) {
      throw new Error('没有可用的生图模型');
    }
    // 角色一致性：描述并入提示词，参考图注入图生图通道（读卡/读图失败降级为原行为）。
    const { characterDescriptions, referenceImages } =
      characterInputs ?? (await this.collectCharacterInputs(project.id));
    const prompt = composeShotImagePrompt({
      scenePrompt: shot.scenePrompt,
      characterDescriptions,
      visualTask: shot.visualTask,
      stylePrompt: project.stylePrompt
    });
    let lastError: Error | null = null;
    for (const candidate of usable) {
      const generate = candidate.adapter.images?.bind(candidate.adapter);
      if (!generate) {
        continue;
      }
      try {
        const results = await generate(
          {
            prompt,
            size: project.config.imageSize || undefined,
            count: 1,
            // 空数组传 undefined：无参考图时保持走 images/generations 通道旧行为。
            referenceImages: referenceImages.length > 0 ? referenceImages : undefined
          },
          candidate.channel
        );
        if (results.length === 0 || !results[0]?.url) {
          throw new Error('生图结果为空');
        }
        const buffer = await this.urlToBuffer(results[0].url);
        const relative = `novel-video/p${project.id}/shot-c${await this.chapterIdxOf(shot)}-s${shot.idx}.jpg`;
        await this.writeUploadFile(relative, buffer);
        return `/uploads/${relative}`;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError ?? new Error('生图失败');
  }

  /** 生成分镜视频片段并下载落盘，返回相对 uploads 路径（OSS 外链会过期，必须本地化）。 */
  private async produceVideo(userId: number, project: NovelProject, shot: NovelShot): Promise<string> {
    // i2v 衔接：首帧图存的是 /uploads/ 相对路径，上游（尤其百炼 i2v 系列）要求公网 URL；
    // 未配置 APP_PUBLIC_BASE_URL 时回落文生视频并写 stage_message 提示。
    let firstFrameUrl: string | undefined;
    const publicBase = (process.env.APP_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
    if ((shot.shotMode ?? 'i2v') === 'i2v' && shot.imageUrl) {
      if (publicBase) {
        firstFrameUrl = `${publicBase}${shot.imageUrl}`;
      } else {
        await this.projectRepo.update(project.id, {
          stageMessage: `分镜 #${shot.idx} 未配置 APP_PUBLIC_BASE_URL，首帧图无法公网访问，回落文生视频`
        });
      }
    }
    const result = await this.video.generate(userId, {
      prompt: composeShotMotionPrompt({
        motionPrompt: shot.motionPrompt,
        progression: shot.progression,
        shotMode: shot.shotMode
      }),
      firstFrameUrl,
      seconds: project.config.videoSeconds,
      size: project.config.videoSize || undefined
    });
    const buffer = await this.urlToBuffer(result.url);
    const relative = `novel-video/p${project.id}/seg-c${await this.chapterIdxOf(shot)}-s${shot.idx}.mp4`;
    await this.writeUploadFile(relative, buffer);
    return relative;
  }

  // ---------- 配音（TTS）与字幕 ----------

  /** TTS 候选（指定模型行优先 + 按 tts 能力兜底），只保留实现了 speech 的适配器。 */
  private async ttsCandidates(modelId?: number) {
    const candidates = await this.deps.router.candidatesByCapability('tts');
    if (!modelId) {
      return candidates.filter((candidate) => candidate.adapter.speech);
    }
    const preferred = await this.deps.router.candidatesByModel(modelId);
    const preferredIds = new Set(preferred.map((candidate) => candidate.model.id));
    return [...preferred, ...candidates.filter((candidate) => !preferredIds.has(candidate.model.id))].filter(
      (candidate) => candidate.adapter.speech
    );
  }

  /** 管线配音阶段：为待配音镜头生成旁白音频；无 tts 候选时整段跳过，不阻塞出片。 */
  private async produceAudios(userId: number, project: NovelProject, projectId: number): Promise<void> {
    const shots = await this.shotRepo.find({ where: { projectId }, order: { id: 'ASC' } });
    // 配音目标集：未完成出片的镜头 + 旁白非空 + 还没有音频。video_done 镜头由单镜端点补配。
    const targets = shots.filter(
      (shot) =>
        ['pending', 'image_done', 'failed'].includes(shot.status) &&
        (shot.narration ?? '').trim() &&
        !shot.audioFile
    );
    if (targets.length === 0) {
      return;
    }
    const usable = await this.ttsCandidates(project.config.ttsModelId);
    await this.projectRepo.update(projectId, { stage: 'tts' });
    if (usable.length === 0) {
      await this.projectRepo.update(projectId, {
        stageMessage: '未配置 tts 能力模型，跳过配音（可用单镜重新生成补配）'
      });
      return;
    }
    for (const [index, shot] of targets.entries()) {
      if (this.cancelled(projectId)) {
        throw new Error('用户取消');
      }
      await this.projectRepo.update(projectId, {
        stageMessage: `配音：第 ${index + 1}/${targets.length} 个分镜`
      });
      try {
        const audio = await this.produceAudio(userId, project, shot);
        await this.shotRepo.update(shot.id, {
          audioUrl: audio.audioUrl,
          audioFile: audio.audioFile,
          audioDurationMs: audio.audioDurationMs,
          status: 'audio_done',
          error: null
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`分镜 ${shot.id} 配音失败: ${message}`); // 继续后续分镜，不阻塞出片
      }
    }
  }

  /** 单镜配音：TTS 合成 → 落盘 → ffprobe 实测时长（无 ffprobe 回落估算，再兜底视频时长）。 */
  private async produceAudio(
    userId: number,
    project: NovelProject,
    shot: NovelShot
  ): Promise<{ audioFile: string; audioUrl: string; audioDurationMs: number }> {
    const narration = normalizeTtsText(shot.narration ?? '');
    if (!narration) {
      throw new Error('旁白为空，无法配音');
    }
    const usable = await this.ttsCandidates(project.config.ttsModelId);
    if (usable.length === 0) {
      throw new Error('没有可用的语音合成模型（tts 能力），请在 AI 模型管理里配置');
    }
    const voice = project.config.ttsVoice || process.env.TTS_DEFAULT_VOICE || 'alloy';
    const timeoutMs = Number(process.env.TTS_TIMEOUT_MS ?? 60000);
    const startedAt = Date.now();
    let lastError: Error | null = null;
    for (const candidate of usable) {
      const speak = candidate.adapter.speech?.bind(candidate.adapter);
      if (!speak) {
        continue;
      }
      try {
        const result = await speak({ text: narration, voice, timeoutMs }, candidate.channel);
        const buffer = Buffer.from(result.audioBase64, 'base64');
        if (buffer.length === 0) {
          throw new Error('语音合成结果为空');
        }
        const relative = `novel-video/p${project.id}/audio-c${await this.chapterIdxOf(shot)}-s${shot.idx}.mp3`;
        await this.writeUploadFile(relative, buffer);
        const absolute = join(process.cwd(), 'uploads', relative);
        const probed = await this.probeAudioDurationMs(absolute);
        const audioDurationMs = probed ?? (estimateSpeechMs(narration) || project.config.videoSeconds * 1000);
        this.deps.usageLog.record({
          userId,
          modelId: candidate.model.id,
          kind: 'tts',
          latencyMs: Date.now() - startedAt,
          status: 'ok'
        });
        return { audioFile: relative, audioUrl: `/uploads/${relative}`, audioDurationMs };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.deps.usageLog.record({
          userId,
          modelId: candidate.model.id,
          kind: 'tts',
          latencyMs: Date.now() - startedAt,
          status: 'failed',
          errorMessage: lastError.message
        });
      }
    }
    throw lastError ?? new Error('配音失败');
  }

  /** ffprobe 实测音频时长毫秒；无 ffprobe / 解析失败返回 null（调用方回落估算）。 */
  private async probeAudioDurationMs(absolutePath: string): Promise<number | null> {
    ffprobeProbe = probeBinary('ffprobe', ffprobeProbe);
    if (!(await ffprobeProbe)) {
      return null;
    }
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_format', absolutePath],
        { timeout: 15000 }
      );
      return parseFfprobeDuration(stdout);
    } catch {
      return null;
    }
  }

  /**
   * 生成项目字幕并落盘，返回 /uploads/ 静态路径。
   * 时间轴口径：按「分段视频时长」（videoSeconds）逐段累加，与 mergeVideos 的 concat 成片
   * 逐段对齐——每段视频按 seconds: videoSeconds 生成（见 produceVideo），concat 后总长 =
   * 分镜数 × videoSeconds。配音音轨尚未混入成片（音画混流/字幕烧录属阶段2，
   * 见 plan/go-taskflow-evaluation-20261028.md「阶段 2」），故不按 audioDurationMs 累加
   * （那会与成片错位）；audioDurationMs 仅落库供展示与阶段2混流使用。
   */
  private async writeSubtitle(projectId: number, shots: NovelShot[], videoSeconds: number): Promise<string> {
    const segments = shots.map((shot) => ({
      text: (shot.narration ?? '').trim(),
      durationMs: videoSeconds * 1000
    }));
    const srt = buildSrt(segments);
    const relative = `novel-video/p${projectId}/subtitle.srt`;
    await this.writeUploadFile(relative, Buffer.from(srt, 'utf8'));
    return `/uploads/${relative}`;
  }

  private async chapterIdxOf(shot: NovelShot): Promise<number> {
    const chapter = await this.chapterRepo.findOne({ where: { id: shot.chapterId }, select: ['idx'] });
    return chapter?.idx ?? 0;
  }

  /** data URL 解码 / http(s) 下载 → Buffer。 */
  private async urlToBuffer(url: string): Promise<Buffer> {
    if (url.startsWith('data:')) {
      return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) {
      throw new Error(`资源下载失败: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async writeUploadFile(relative: string, buffer: Buffer): Promise<void> {
    const absolute = join(process.cwd(), 'uploads', relative);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, buffer);
  }

  /** ffmpeg 合成：concat demuxer 直拷贝，失败回落重编码。 */
  private async mergeVideos(projectId: number, shots: NovelShot[]): Promise<string> {
    // 主机无 ffmpeg 时直接报明确错误，而不是让 execFile 抛 ENOENT。
    await assertFfmpegAvailable();
    const projectDir = join(UPLOAD_ROOT, `p${projectId}`);
    await mkdir(projectDir, { recursive: true });
    const listFile = join(projectDir, 'concat.txt');
    const listContent = shots
      .map((shot) => `file '${join(process.cwd(), 'uploads', shot.videoFile ?? '').replace(/'/g, "'\\''")}'`)
      .join('\n');
    await writeFile(listFile, listContent, 'utf8');
    const finalAbsolute = join(projectDir, 'final.mp4');
    try {
      await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', finalAbsolute], {
        timeout: 300000
      });
    } catch {
      // 片段编码参数不一致时回落重编码。
      await execFileAsync(
        'ffmpeg',
        [
          '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
          '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
          '-r', '24', '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-movflags', '+faststart',
          finalAbsolute
        ],
        { timeout: 600000 }
      );
    }
    return `/uploads/novel-video/p${projectId}/final.mp4`;
  }

  // ---------- 单镜创作控制（片段级配置 / AI 重新规划 / 单镜重生成 / 字幕重生成） ----------

  private async requireShot(projectId: number, shotId: number): Promise<NovelShot> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    assertProjectIdle(this.active, projectId);
    const shot = await this.shotRepo.findOne({ where: { id: shotId, projectId } });
    if (!shot) {
      throw new NotFoundException('分镜不存在');
    }
    return shot;
  }

  /** 更新单镜创作控制字段（锁定原文/视觉任务/推进/生成模式/首帧锁定/旁白）。 */
  async updateShot(projectId: number, shotId: number, dto: UpdateShotDto): Promise<NovelShot> {
    const shot = await this.requireShot(projectId, shotId);
    await this.shotRepo.update(shot.id, {
      lockedSourceText: dto.lockedSourceText !== undefined ? dto.lockedSourceText : shot.lockedSourceText,
      visualTask: dto.visualTask !== undefined ? dto.visualTask : shot.visualTask,
      progression: dto.progression !== undefined ? dto.progression : shot.progression,
      shotMode: dto.shotMode ?? shot.shotMode,
      firstFrameLocked: dto.firstFrameLocked ?? shot.firstFrameLocked,
      narration: dto.narration !== undefined ? dto.narration : shot.narration
    });
    return (await this.shotRepo.findOne({ where: { id: shot.id } }))!;
  }

  /** 单镜 AI 重新规划：LLM 优化画面/运动提示词；锁定原文时旁白不改写（代码兜底，不信任 LLM）。 */
  async replanShot(userId: number, projectId: number, shotId: number): Promise<NovelShot> {
    const shot = await this.requireShot(projectId, shotId);
    const project = (await this.projectRepo.findOne({ where: { id: projectId } }))!;
    const chapter = await this.chapterRepo.findOne({ where: { id: shot.chapterId } });
    // 旁白锁定：lockedSourceText 非空 = 旁白以原文为准，仅改画面。
    const narrationLocked = Boolean((shot.lockedSourceText ?? '').trim());
    const system =
      '你是专业的短视频编导。重新规划这一个分镜，让画面描述与镜头运动更连贯、更有镜头感。' +
      '只输出 JSON，不要任何其他文字。格式：{"scenePrompt":"英文首帧画面提示词","motionPrompt":"英文镜头运动提示词","narration":"中文旁白，30字以内"}' +
      (narrationLocked ? ' 旁白已锁定（以用户提供的原文片段为准），仅优化画面与镜头运动，narration 保持原文不改写。' : '');
    const user = [
      chapter ? `章节标题：${chapter.title}` : '',
      shot.lockedSourceText ? `锁定原文（旁白以此为准）：${shot.lockedSourceText}` : '',
      `当前画面提示词：${shot.scenePrompt}`,
      `当前运动提示词：${shot.motionPrompt}`,
      shot.visualTask ? `视觉任务：${shot.visualTask}` : '',
      shot.progression ? `推进方式：${shot.progression}` : '',
      `当前旁白：${shot.narration ?? ''}`
    ]
      .filter(Boolean)
      .join('\n');
    const { text } = await runLlm(this.deps, [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ], {
      temperature: 0.7,
      userId,
      modelId: project.config.storyboardModelId
    });
    const parsed = parseJsonBlock(text) as Partial<StoryboardShot> | undefined;
    if (!parsed || typeof parsed.scenePrompt !== 'string' || typeof parsed.motionPrompt !== 'string') {
      throw new Error('重新规划失败：LLM 未返回有效的 scenePrompt/motionPrompt JSON');
    }
    const nextNarration = narrationLocked
      ? shot.narration ?? ''
      : typeof parsed.narration === 'string'
        ? parsed.narration
        : shot.narration ?? '';
    await this.shotRepo.update(shot.id, {
      scenePrompt: parsed.scenePrompt,
      motionPrompt: parsed.motionPrompt,
      narration: nextNarration,
      status: 'pending', // 提示词已变，产物待重做
      error: null
    });
    return (await this.shotRepo.findOne({ where: { id: shot.id } }))!;
  }

  /** 单镜重生成：image 重绘首帧（锁定时拒绝）、video 重出片段、audio 补配音（不回退状态）。 */
  async regenerateShot(
    userId: number,
    projectId: number,
    shotId: number,
    step: 'image' | 'video' | 'audio'
  ): Promise<NovelShot> {
    const shot = await this.requireShot(projectId, shotId);
    const project = (await this.projectRepo.findOne({ where: { id: projectId } }))!;
    if (step === 'image') {
      if (shot.firstFrameLocked && shot.imageUrl) {
        throw new BadRequestException('该分镜已锁定首帧，请先解除锁定再重新生成');
      }
      const startedAt = Date.now();
      try {
        const imageUrl = await this.produceImage(project, shot);
        await this.shotRepo.update(shot.id, {
          imageUrl,
          error: null,
          // video_done 镜头只换首帧不回退状态；其余推进到 image_done。
          status: shot.status === 'video_done' ? 'video_done' : 'image_done',
          durationMs: Date.now() - startedAt
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.shotRepo.update(shot.id, { error: message, durationMs: Date.now() - startedAt });
        throw error;
      }
    } else if (step === 'video') {
      const startedAt = Date.now();
      try {
        const videoFile = await this.produceVideo(userId, project, shot);
        await this.shotRepo.update(shot.id, {
          videoUrl: `/uploads/${videoFile}`,
          videoFile,
          status: 'video_done',
          error: null,
          durationMs: Date.now() - startedAt
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.shotRepo.update(shot.id, { error: message, durationMs: Date.now() - startedAt });
        throw error;
      }
    } else {
      // 补配音：只写音频三列，绝不回退 status（video_done 补音后仍为 video_done，成片复用不受影响）。
      const audio = await this.produceAudio(userId, project, shot);
      await this.shotRepo.update(shot.id, {
        audioUrl: audio.audioUrl,
        audioFile: audio.audioFile,
        audioDurationMs: audio.audioDurationMs,
        error: null
      });
    }
    return (await this.shotRepo.findOne({ where: { id: shot.id } }))!;
  }

  /** 手动重生成字幕：按当前成片镜头顺序重建 SRT 并落盘。 */
  async regenerateSubtitle(projectId: number): Promise<{ subtitlePath: string }> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    assertProjectIdle(this.active, projectId);
    const finalShots = await this.shotRepo.find({
      where: { projectId, status: 'video_done' },
      order: { id: 'ASC' }
    });
    if (finalShots.length === 0) {
      throw new BadRequestException('没有已出片的分镜，无法生成字幕');
    }
    const subtitlePath = await this.writeSubtitle(projectId, finalShots, project.config.videoSeconds);
    await this.projectRepo.update(projectId, { finalSubtitlePath: subtitlePath });
    return { subtitlePath };
  }

  // ---------- 查询与管理 ----------

  async create(userId: number, dto: { name: string; text: string; stylePrompt?: string; config?: Partial<NovelPipelineConfig> }) {
    const config: NovelPipelineConfig = { ...DEFAULT_NOVEL_CONFIG, ...dto.config };
    const project = await this.projectRepo.save(
      this.projectRepo.create({
        name: dto.name.trim(),
        sourceText: dto.text,
        stylePrompt: dto.stylePrompt?.trim() || null,
        config,
        status: 'draft',
        stage: 'split',
        createdBy: userId
      })
    );
    await this.persistChapters(project.id, dto.text);
    return this.detail(project.id);
  }

  async update(id: number, dto: { name?: string; stylePrompt?: string; coverUrl?: string | null; config?: Partial<NovelPipelineConfig> }) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (this.active.has(id)) {
      throw new BadRequestException('项目正在运行中，无法编辑');
    }
    await this.projectRepo.update(id, {
      name: dto.name?.trim() ?? project.name,
      stylePrompt: dto.stylePrompt !== undefined ? dto.stylePrompt.trim() || null : project.stylePrompt,
      coverUrl: dto.coverUrl !== undefined ? dto.coverUrl?.trim() || null : project.coverUrl,
      config: dto.config ? { ...project.config, ...dto.config } : project.config
    });
    return this.detail(id);
  }

  async detail(projectId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    const chapters = await this.chapterRepo.find({ where: { projectId }, order: { idx: 'ASC' } });
    const shots = await this.shotRepo.find({ where: { projectId }, order: { id: 'ASC' } });
    return {
      project,
      chapters,
      shots,
      progress: {
        total: shots.length,
        done: shots.filter((shot) => shot.status === 'video_done').length,
        failed: shots.filter((shot) => shot.status === 'failed').length
      }
    };
  }

  async list() {
    // 列表不需要整本原文（longtext，随项目数线性放大传输/序列化），只取展示与统计字段
    const projects = await this.projectRepo.find({
      select: {
        id: true,
        name: true,
        status: true,
        stage: true,
        stageMessage: true,
        finalVideoPath: true,
        coverUrl: true,
        error: true,
        durationMs: true,
        createdAt: true
      },
      order: { id: 'DESC' }
    });
    if (projects.length === 0) {
      return [];
    }
    const counts = await this.shotRepo
      .createQueryBuilder('shot')
      .select('shot.projectId', 'projectId')
      .addSelect('COUNT(*)', 'total')
      .addSelect("SUM(CASE WHEN shot.status = 'video_done' THEN 1 ELSE 0 END)", 'done')
      .where('shot.projectId IN (:...ids)', { ids: projects.map((project) => project.id) })
      .groupBy('shot.projectId')
      .getRawMany<{ projectId: string; total: string; done: string }>();
    const countByProject = new Map(counts.map((row) => [Number(row.projectId), row]));
    return projects.map((project) => {
      const count = countByProject.get(project.id);
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        stage: project.stage,
        stageMessage: project.stageMessage,
        finalVideoPath: project.finalVideoPath,
        coverUrl: project.coverUrl,
        error: project.error,
        totalShots: count ? Number(count.total) : 0,
        doneShots: count ? Number(count.done) : 0,
        durationMs: project.durationMs,
        createdAt: project.createdAt
      };
    });
  }

  async remove(projectId: number) {
    if (this.active.has(projectId)) {
      throw new BadRequestException('项目正在运行中，请先取消');
    }
    await this.clearArtifacts(projectId);
    // 角色卡是项目级创作资产，仅随整项目删除；reSplit 不清（见 clearArtifacts 注释）。
    await this.characterRepo.delete({ projectId });
    await this.projectRepo.delete(projectId);
    return { success: true };
  }

  /**
   * 清理章节/分镜产物与产物目录。不删角色卡：角色卡是手工录入的项目级资产
   * （外观描述 + 参考图），与章节/分镜产物无依赖关系，重切分文本后重新出片
   * 恰恰最需要角色一致性注入，因此只有整项目删除（remove）才连带清理。
   */
  private async clearArtifacts(projectId: number) {
    await this.shotRepo.delete({ projectId });
    await this.chapterRepo.delete({ projectId });
    const dir = join(UPLOAD_ROOT, `p${projectId}`);
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // ---------- 角色库 CRUD（控制器 CharacterCardController；列表/注入排序：主角色优先） ----------

  listCharacterCards(projectId: number) {
    return this.characterRepo.find({
      where: { projectId },
      order: { isPrimary: 'DESC', sortOrder: 'ASC', id: 'ASC' }
    });
  }

  async createCharacterCard(userId: number, dto: CreateCharacterCardDto) {
    const project = await this.projectRepo.findOne({ where: { id: dto.projectId }, select: ['id'] });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    return this.characterRepo.save(
      this.characterRepo.create({
        projectId: dto.projectId,
        name: dto.name.trim(),
        appearance: dto.appearance?.trim() || null,
        referenceImages: dto.referenceImages ?? [],
        isPrimary: dto.isPrimary ?? false,
        createdBy: userId
      })
    );
  }

  async updateCharacterCard(id: number, dto: UpdateCharacterCardDto) {
    const card = await this.characterRepo.findOne({ where: { id } });
    if (!card) {
      throw new NotFoundException('角色不存在');
    }
    await this.characterRepo.update(id, {
      name: dto.name !== undefined ? dto.name.trim() : card.name,
      appearance: dto.appearance !== undefined ? dto.appearance?.trim() || null : card.appearance,
      referenceImages: dto.referenceImages !== undefined ? dto.referenceImages : card.referenceImages,
      isPrimary: dto.isPrimary ?? card.isPrimary
    });
    // update 与回读之间存在并发删除窗口：回读为 null 时按不存在处理（与 removeCharacterCard 口径一致）。
    const updated = await this.characterRepo.findOne({ where: { id } });
    if (!updated) {
      throw new NotFoundException('角色不存在');
    }
    return updated;
  }

  async removeCharacterCard(id: number) {
    const result = await this.characterRepo.delete(id);
    if (!result.affected) {
      throw new NotFoundException('角色不存在');
    }
    return { success: true };
  }
}
