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
import { ModelRouterService } from '../../ai/core/model-router.service';
import { UsageLogService } from '../../ai/core/usage-log.service';
import { ChatMessagePayload } from '../../ai/core/llm-adapter.interface';
import { VideoUpstreamService } from '../engine/video-upstream.service';
import { NodeHandlerDependencies, parseJsonBlock, runLlm } from '../engine/node-handlers';

const execFileAsync = promisify(execFile);
const UPLOAD_ROOT = join(process.cwd(), 'uploads', 'novel-video');
// 章节内容送入 LLM 的长度上限（超出截断，避免上下文溢出）。
const CHAPTER_CONTEXT_LIMIT = 3000;

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

  /** 章节切分：优先按「第X章/回/节」标题正则，无标题时按段落长度切。 */
  splitText(text: string): Array<{ idx: number; title: string; content: string }> {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
      throw new BadRequestException('小说内容为空');
    }
    const pattern = /^(.{0,40}?第[一二三四五六七八九十百千万零\d]+[章回节][^\n]{0,60})$/gm;
    const marks: Array<{ index: number; title: string }> = [];
    for (const match of normalized.matchAll(pattern)) {
      marks.push({ index: match.index ?? 0, title: match[1].trim().slice(0, 120) });
    }
    const slices: Array<{ title: string; content: string }> = [];
    if (marks.length >= 2) {
      for (let i = 0; i < marks.length; i += 1) {
        const start = marks[i].index;
        const end = i + 1 < marks.length ? marks[i + 1].index : normalized.length;
        const content = normalized.slice(start, end).trim();
        if (content.length > 20) {
          slices.push({ title: marks[i].title, content });
        }
      }
    } else {
      // 无章节标记：按 ~1200 字在段落边界切片。
      const paragraphs = normalized.split(/\n{2,}|\n/).filter((item) => item.trim());
      let buffer = '';
      let index = 1;
      for (const paragraph of paragraphs) {
        if (buffer.length + paragraph.length > 1200 && buffer) {
          slices.push({ title: `片段 ${index}`, content: buffer.trim() });
          index += 1;
          buffer = '';
        }
        buffer += `${paragraph}\n`;
      }
      if (buffer.trim()) {
        slices.push({ title: `片段 ${index}`, content: buffer.trim() });
      }
    }
    if (slices.length === 0) {
      throw new BadRequestException('切分结果为空，请检查文本内容');
    }
    return slices.slice(0, 50).map((slice, idx) => ({ idx: idx + 1, title: slice.title, content: slice.content }));
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

      // 2) 出图出视频：逐分镜顺序执行。
      chapters = await this.chapterRepo.find({ where: { projectId }, order: { idx: 'ASC' } });
      const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
      const shots = await this.shotRepo.find({ where: { projectId }, order: { id: 'ASC' } });
      const executable = shots.filter((shot) => shot.status !== 'video_done');
      const total = shots.length;
      let done = shots.filter((shot) => shot.status === 'video_done').length;
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
          const imageUrl = await this.produceImage(project, shot);
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

      // 3) 合成。
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
      const finalPath = await this.mergeVideos(projectId, finalShots);
      const failedShots = (await this.shotRepo.count({ where: { projectId, status: 'failed' } })) ?? 0;
      const cancelledNow = this.cancelled(projectId);
      await this.projectRepo.update(projectId, {
        status: cancelledNow ? 'cancelled' : 'completed',
        stage: 'done',
        stageMessage: failedShots > 0 ? `完成（${failedShots} 个分镜失败已跳过）` : '全部完成',
        finalVideoPath: finalPath,
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

  /** 生成分镜首帧图并落盘，返回静态 URL。 */
  private async produceImage(project: NovelProject, shot: NovelShot): Promise<string> {
    const candidates = await this.deps.router.candidatesByCapability('image');
    const usable = candidates.filter((candidate) => candidate.adapter.images);
    if (usable.length === 0) {
      throw new Error('没有可用的生图模型');
    }
    const prompt = project.stylePrompt ? `${shot.scenePrompt}, ${project.stylePrompt}` : shot.scenePrompt;
    let lastError: Error | null = null;
    for (const candidate of usable) {
      const generate = candidate.adapter.images?.bind(candidate.adapter);
      if (!generate) {
        continue;
      }
      try {
        const results = await generate(
          { prompt, size: project.config.imageSize || undefined, count: 1 },
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
    const result = await this.video.generate(userId, {
      prompt: shot.motionPrompt,
      seconds: project.config.videoSeconds,
      size: project.config.videoSize || undefined
    });
    const buffer = await this.urlToBuffer(result.url);
    const relative = `novel-video/p${project.id}/seg-c${await this.chapterIdxOf(shot)}-s${shot.idx}.mp4`;
    await this.writeUploadFile(relative, buffer);
    return relative;
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

  async update(id: number, dto: { name?: string; stylePrompt?: string; config?: Partial<NovelPipelineConfig> }) {
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
    const projects = await this.projectRepo.find({ order: { id: 'DESC' } });
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
    await this.projectRepo.delete(projectId);
    return { success: true };
  }

  private async clearArtifacts(projectId: number) {
    await this.shotRepo.delete({ projectId });
    await this.chapterRepo.delete({ projectId });
    const dir = join(UPLOAD_ROOT, `p${projectId}`);
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
