// 智能体管理服务：native（提示词编排 + 绑模型）/ dify（远程应用，端点密钥自带）。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAgent } from '../../../common/entities/ai-agent.entity';
import { AiModel } from '../../../common/entities/ai-model.entity';
import { encryptSecret, isEncryptionConfigured, maskSecret } from '../core/crypto.util';
import { CreateAgentDto, UpdateAgentDto } from './dto/ai-admin.dto';

@Injectable()
export class AiAgentsService {
  constructor(
    @InjectRepository(AiAgent) private readonly agentRepo: Repository<AiAgent>,
    @InjectRepository(AiModel) private readonly modelRepo: Repository<AiModel>
  ) {}

  async list() {
    const items = await this.agentRepo.find({ order: { sort: 'ASC', id: 'DESC' } });
    return items.map((item) => this.toVo(item));
  }

  // 对话页下拉：仅启用项（登录即可见）。
  async listEnabled() {
    const items = await this.agentRepo.find({
      where: { status: 1 },
      order: { sort: 'ASC', id: 'DESC' }
    });
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      kind: item.kind,
      modelId: item.modelId,
      openingLine: item.openingLine,
      allowImage: item.allowImage
    }));
  }

  async create(dto: CreateAgentDto) {
    await this.validateRefs(dto.kind, dto.modelId);
    const entity = this.agentRepo.create({
      name: dto.name.trim(),
      description: dto.description,
      kind: dto.kind,
      modelId: dto.kind === 'native' ? dto.modelId : undefined,
      systemPrompt: dto.systemPrompt,
      temperature: String(dto.temperature ?? 0.7),
      topP: dto.topP !== undefined ? String(dto.topP) : undefined,
      maxTokens: dto.maxTokens,
      openingLine: dto.openingLine,
      allowImage: dto.allowImage ?? 0,
      sort: dto.sort ?? 0
    });
    this.applyDifyCredentials(entity, dto.kind, dto.baseUrl, dto.apiKey);
    const saved = await this.agentRepo.save(entity);
    return this.toVo(saved);
  }

  async update(id: number, dto: UpdateAgentDto) {
    const record = await this.agentRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('智能体不存在');
    }
    const kind = dto.kind ?? record.kind;
    await this.validateRefs(kind, dto.modelId ?? record.modelId);
    if (dto.name !== undefined) record.name = dto.name.trim();
    if (dto.description !== undefined) record.description = dto.description;
    if (dto.kind !== undefined) record.kind = dto.kind;
    if (dto.modelId !== undefined) record.modelId = kind === 'native' ? dto.modelId : undefined;
    if (dto.systemPrompt !== undefined) record.systemPrompt = dto.systemPrompt;
    if (dto.temperature !== undefined) record.temperature = String(dto.temperature);
    if (dto.topP !== undefined) record.topP = String(dto.topP);
    if (dto.maxTokens !== undefined) record.maxTokens = dto.maxTokens;
    if (dto.openingLine !== undefined) record.openingLine = dto.openingLine;
    if (dto.allowImage !== undefined) record.allowImage = dto.allowImage;
    if (dto.sort !== undefined) record.sort = dto.sort;
    if (dto.status !== undefined) record.status = dto.status;
    // 切回 native 时清掉 dify 凭据（TypeORM save 跳过 undefined，须显式置 NULL）；留空不修改密钥。
    if (kind !== 'dify') {
      if (record.apiKeyCipher || record.baseUrl) {
        await this.agentRepo.update(record.id, {
          baseUrl: null,
          apiKeyCipher: null,
          apiKeyMask: null
        } as unknown as Partial<AiAgent>);
        record.baseUrl = undefined;
        record.apiKeyCipher = undefined;
        record.apiKeyMask = undefined;
      }
    } else if (dto.baseUrl !== undefined || (dto.apiKey !== undefined && dto.apiKey.trim() !== '')) {
      this.applyDifyCredentials(record, kind, dto.baseUrl ?? record.baseUrl, dto.apiKey);
    }
    const saved = await this.agentRepo.save(record);
    return this.toVo(saved);
  }

  async remove(id: number) {
    const record = await this.agentRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('智能体不存在');
    }
    await this.agentRepo.remove(record);
    return { success: true };
  }

  private applyDifyCredentials(
    entity: AiAgent,
    kind: string,
    baseUrl?: string,
    apiKey?: string
  ) {
    if (kind !== 'dify') {
      return;
    }
    if (!baseUrl || !baseUrl.trim()) {
      throw new BadRequestException('dify 智能体必须填写 API 端点地址');
    }
    if (!entity.apiKeyCipher && (!apiKey || !apiKey.trim())) {
      throw new BadRequestException('dify 智能体必须填写 API Key');
    }
    this.assertEncryptionReady();
    entity.baseUrl = baseUrl.trim().replace(/\/+$/, '');
    if (apiKey && apiKey.trim() !== '') {
      entity.apiKeyCipher = encryptSecret(apiKey);
      entity.apiKeyMask = maskSecret(apiKey);
    }
  }

  private assertEncryptionReady() {
    if (!isEncryptionConfigured()) {
      throw new BadRequestException('未配置 AI_ENCRYPTION_KEY，无法加密保存 API Key');
    }
  }

  private async validateRefs(kind: string, modelId?: number) {
    if (kind === 'native') {
      if (!modelId) {
        throw new BadRequestException('native 智能体必须绑定模型');
      }
      const model = await this.modelRepo.findOne({ where: { id: modelId, status: 1 } });
      if (!model) {
        throw new BadRequestException('绑定的模型不存在或已停用');
      }
    }
  }

  private toVo(item: AiAgent) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      kind: item.kind,
      modelId: item.modelId,
      baseUrl: item.baseUrl,
      apiKeyMask: item.apiKeyMask,
      systemPrompt: item.systemPrompt,
      temperature: Number(item.temperature),
      topP: item.topP != null ? Number(item.topP) : undefined,
      maxTokens: item.maxTokens,
      openingLine: item.openingLine,
      allowImage: item.allowImage,
      sort: item.sort,
      status: item.status,
      createdAt: item.createdAt
    };
  }
}
