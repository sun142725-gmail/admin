// 生图服务：按模型能力路由到 image 渠道，结果落库（ai_images）供历史查看。
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
        const results = await candidate.adapter.images(
          { prompt: dto.prompt, size: dto.size, count: dto.count ?? 1 },
          candidate.channel
        );
        const records = await this.imageRepo.save(
          results.map((item) =>
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
}
