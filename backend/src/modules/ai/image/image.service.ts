// 生图服务：按模型能力路由到 image 渠道，结果落库（ai_images）供历史查看。
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import { AiImage } from '../../../common/entities/ai-image.entity';
import { ModelRouterService, RoutedCandidate } from '../core/model-router.service';
import { UsageLogService } from '../core/usage-log.service';
import { GenerateImageDto } from './dto/image.dto';

@Injectable()
export class AiImageService {
  constructor(
    @InjectRepository(AiImage) private readonly imageRepo: Repository<AiImage>,
    private readonly router: ModelRouterService,
    private readonly usageLog: UsageLogService
  ) {}

  async history(userId: number) {
    const items = await this.imageRepo.find({
      where: { userId },
      order: { id: 'DESC' },
      take: 100
    });
    return items.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      size: item.size,
      url: item.url,
      status: item.status,
      createdAt: item.createdAt
    }));
  }

  async generate(userId: number, dto: GenerateImageDto) {
    let candidates: RoutedCandidate[] = [];
    if (dto.modelId) {
      candidates = await this.router.candidatesByModel(dto.modelId);
    } else {
      candidates = await this.router.candidatesByCapability('image');
    }
    if (candidates.length === 0) {
      throw new BadRequestException('没有可用的生图模型，请联系管理员配置 image 能力模型');
    }

    const startedAt = Date.now();
    let lastError: Error | null = null;
    for (const candidate of candidates) {
      if (!candidate.adapter.images) {
        continue;
      }
      try {
        // referenceImages 有值时适配器自动切 images/edits（图生图）；undefined 走 generations，行为不变。
        const results = await candidate.adapter.images(
          { prompt: dto.prompt, size: dto.size, count: dto.count ?? 1, referenceImages: dto.referenceImages },
          candidate.channel
        );
        // 上游 gpt-image 系常返回 b64_json（适配器转 data URL，可达数 MB），ai_images.url 仅 varchar(512)，
        // 直接落库必超长（MySQL 严格模式 422）。data URL 统一落盘 uploads/ai-images/ 后存短路径；
        // 落盘失败 best-effort 保留原 data URL（前端 Image 可直接渲染 data URL，仅历史记录超长风险）。
        const persisted = await Promise.all(
          results.map(async (item, index) => ({
            ...item,
            url: item.url.startsWith('data:') ? await this.persistDataUrl(item.url, index) : item.url
          }))
        );
        const records = await this.imageRepo.save(
          persisted.map((item) =>
            this.imageRepo.create({
              userId,
              modelId: candidate.model.id || undefined,
              prompt: dto.prompt,
              size: dto.size,
              url: item.url
            })
          )
        );
        this.usageLog.record({
          userId,
          modelId: candidate.model.id || undefined,
          kind: 'image',
          latencyMs: Date.now() - startedAt,
          status: 'ok'
        });
        return {
          images: records.map((record) => ({
            id: record.id,
            url: record.url,
            prompt: record.prompt,
            size: record.size
          }))
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('生图失败');
      }
    }
    this.usageLog.record({
      userId,
      kind: 'image',
      latencyMs: Date.now() - startedAt,
      status: 'failed',
      errorMessage: lastError?.message?.slice(0, 255)
    });
    throw new BadRequestException(lastError?.message ?? '生图失败，请稍后重试');
  }

  /** data URL 结果落盘 uploads/ai-images/：返回 /uploads 短路径；失败原样返回（best-effort 不阻塞）。 */
  private async persistDataUrl(dataUrl: string, index: number): Promise<string> {
    try {
      const matched = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!matched) {
        return dataUrl;
      }
      const ext = matched[1].includes('jpeg') || matched[1].includes('jpg') ? 'jpg' : matched[1].includes('webp') ? 'webp' : 'png';
      const relative = `ai-images/${Date.now()}-${index}.${ext}`;
      const absolute = join(process.cwd(), 'uploads', relative);
      await mkdir(join(absolute, '..'), { recursive: true });
      await writeFile(absolute, Buffer.from(matched[2], 'base64'));
      return `/uploads/${relative}`;
    } catch {
      return dataUrl;
    }
  }
}
