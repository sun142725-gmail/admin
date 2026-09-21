// 模型路由：一行模型 = 一个端点。按 modelKey 聚合同名模型行（多上游互为备份），
// 优先级降序 + 同级按权重随机，调用方逐个故障转移。
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgent } from '../../../common/entities/ai-agent.entity';
import { AiModel } from '../../../common/entities/ai-model.entity';
import { decryptSecret } from './crypto.util';
import { DifyAdapter } from './adapters/dify.adapter';
import { OpenAiCompatibleAdapter } from './adapters/openai-compatible.adapter';
import { LlmAdapter, ResolvedChannel } from './llm-adapter.interface';

export interface RoutedCandidate {
  model: AiModel;
  adapter: LlmAdapter;
  channel: ResolvedChannel;
}

@Injectable()
export class ModelRouterService {
  private readonly adapters: Map<string, LlmAdapter>;

  constructor(
    @InjectRepository(AiModel) private readonly modelRepo: Repository<AiModel>,
    private readonly openAiAdapter: OpenAiCompatibleAdapter,
    private readonly difyAdapter: DifyAdapter
  ) {
    this.adapters = new Map<string, LlmAdapter>(
      [this.openAiAdapter, this.difyAdapter].map((adapter) => [adapter.type, adapter])
    );
  }

  adapterFor(type: string): LlmAdapter | undefined {
    return this.adapters.get(type);
  }

  /** 指定模型行的候选列表：自动聚合同 model_key 的其他启用行（多上游互为备份）。 */
  async candidatesByModel(modelId: number): Promise<RoutedCandidate[]> {
    const model = await this.modelRepo.findOne({ where: { id: modelId, status: 1 } });
    if (!model) {
      return [];
    }
    return this.buildCandidates({ modelKey: model.modelKey });
  }

  /** 按能力取全部候选（如 chat/image），优先级降序、同级权重随机。 */
  async candidatesByCapability(capability: string): Promise<RoutedCandidate[]> {
    return this.buildCandidates({ capability });
  }

  /** Dify 智能体直连：端点与密钥挂在智能体自身，不走模型注册。 */
  async candidatesForDify(agent: AiAgent): Promise<RoutedCandidate[]> {
    const adapter = this.adapters.get('dify');
    if (!adapter || !agent.baseUrl || !agent.apiKeyCipher) {
      return [];
    }
    let apiKeyPlain: string;
    try {
      apiKeyPlain = decryptSecret(agent.apiKeyCipher);
    } catch {
      return [];
    }
    return [
      {
        model: { id: 0 } as AiModel,
        adapter,
        channel: {
          label: agent.name,
          type: 'dify',
          baseUrl: agent.baseUrl.replace(/\/+$/, ''),
          apiKeyPlain,
          upstreamModel: ''
        }
      }
    ];
  }

  /** 构建模型行候选：同 model_key 聚合（指定时）、能力过滤、优先级+权重排序、密钥解密。 */
  private async buildCandidates(
    where: { modelKey?: string; capability?: string }
  ): Promise<RoutedCandidate[]> {
    const rows = await this.modelRepo.find({ where: { status: 1 } });
    const matched = rows.filter(
      (row) =>
        (!where.modelKey || row.modelKey === where.modelKey) &&
        (!where.capability || row.capabilities.split(',').includes(where.capability))
    );
    if (matched.length === 0) {
      return [];
    }

    // 同优先级内按权重随机，优先级之间严格有序。
    const groups = new Map<number, AiModel[]>();
    matched.forEach((row) => {
      const list = groups.get(row.priority) ?? [];
      list.push(row);
      groups.set(row.priority, list);
    });
    const ordered: AiModel[] = [];
    [...groups.keys()]
      .sort((a, b) => b - a)
      .forEach((priority) => {
        ordered.push(...this.shuffleByWeight(groups.get(priority) ?? []));
      });

    const candidates: RoutedCandidate[] = [];
    for (const row of ordered) {
      const adapter = this.adapters.get(row.type);
      if (!adapter) {
        continue;
      }
      let apiKeyPlain: string;
      try {
        apiKeyPlain = decryptSecret(row.apiKeyCipher);
      } catch {
        continue; // 密文损坏的行直接跳过。
      }
      candidates.push({
        model: row,
        adapter,
        channel: {
          modelRowId: row.id,
          label: row.displayName,
          type: row.type,
          baseUrl: row.baseUrl.replace(/\/+$/, ''),
          apiKeyPlain,
          upstreamModel: row.modelKey
        }
      });
    }
    return candidates;
  }

  private shuffleByWeight(items: AiModel[]): AiModel[] {
    const pool = [...items];
    const result: AiModel[] = [];
    while (pool.length > 0) {
      const total = pool.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
      let roll = Math.random() * total;
      let index = 0;
      for (; index < pool.length; index += 1) {
        roll -= Math.max(1, pool[index].weight);
        if (roll <= 0) {
          break;
        }
      }
      result.push(...pool.splice(Math.min(index, pool.length - 1), 1));
    }
    return result;
  }
}
