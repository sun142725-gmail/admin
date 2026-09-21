// 用量日志：异步落库，失败仅告警不影响主流程。
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLog } from '../../../common/entities/ai-usage-log.entity';

export interface UsageLogPayload {
  userId: number;
  modelId?: number;
  kind: 'chat' | 'image';
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  status?: 'ok' | 'failed' | 'stopped';
  errorMessage?: string;
}

@Injectable()
export class UsageLogService {
  private readonly logger = new Logger(UsageLogService.name);

  constructor(
    @InjectRepository(AiUsageLog) private readonly usageRepo: Repository<AiUsageLog>
  ) {}

  record(payload: UsageLogPayload): void {
    const promptTokens = payload.promptTokens ?? 0;
    const completionTokens = payload.completionTokens ?? 0;
    const entity = this.usageRepo.create({
      ...payload,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      status: payload.status ?? 'ok'
    });
    void this.usageRepo.save(entity).catch((error: unknown) => {
      this.logger.warn(`用量日志落库失败: ${error instanceof Error ? error.message : '未知错误'}`);
    });
  }
}
