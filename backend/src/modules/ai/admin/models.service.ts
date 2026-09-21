// 模型管理服务：一行模型 = 端点（协议/地址/密钥）。密钥加密落库，同名模型多行互为备份。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModel } from '../../../common/entities/ai-model.entity';
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  maskSecret
} from '../core/crypto.util';
import { ModelRouterService } from '../core/model-router.service';
import { CreateModelDto, UpdateModelDto } from './dto/ai-admin.dto';

@Injectable()
export class AiModelsService {
  constructor(
    @InjectRepository(AiModel) private readonly modelRepo: Repository<AiModel>,
    private readonly router: ModelRouterService
  ) {}

  async list() {
    const items = await this.modelRepo.find({ order: { modelKey: 'ASC', priority: 'DESC', id: 'ASC' } });
    return items.map((item) => this.toVo(item));
  }

  async create(dto: CreateModelDto) {
    this.assertEncryptionReady();
    const modelKey = dto.modelKey.trim();
    const baseUrl = this.normalizeBaseUrl(dto.baseUrl);
    await this.assertNotDuplicated(modelKey, baseUrl);
    const entity = this.modelRepo.create({
      modelKey,
      displayName: dto.displayName.trim(),
      type: dto.type,
      baseUrl,
      apiKeyCipher: encryptSecret(dto.apiKey),
      apiKeyMask: maskSecret(dto.apiKey),
      capabilities: dto.capabilities?.trim() || 'chat',
      contextLength: dto.contextLength ?? 8192,
      maxOutput: dto.maxOutput ?? 4096,
      priority: dto.priority ?? 0,
      weight: dto.weight ?? 1,
      remark: dto.remark,
      status: dto.status ?? 1
    });
    const saved = await this.modelRepo.save(entity);
    return this.toVo(saved);
  }

  async update(id: number, dto: UpdateModelDto) {
    const record = await this.modelRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('模型不存在');
    }
    const modelKey = record.modelKey;
    const baseUrl = dto.baseUrl !== undefined ? this.normalizeBaseUrl(dto.baseUrl) : record.baseUrl;
    if (dto.baseUrl !== undefined) {
      await this.assertNotDuplicated(modelKey, baseUrl, id);
    }
    if (dto.displayName !== undefined) record.displayName = dto.displayName.trim();
    if (dto.type !== undefined) record.type = dto.type;
    if (dto.baseUrl !== undefined) record.baseUrl = baseUrl;
    // 留空不修改密钥。
    if (dto.apiKey !== undefined && dto.apiKey.trim() !== '') {
      this.assertEncryptionReady();
      record.apiKeyCipher = encryptSecret(dto.apiKey);
      record.apiKeyMask = maskSecret(dto.apiKey);
    }
    if (dto.capabilities !== undefined) record.capabilities = dto.capabilities.trim();
    if (dto.contextLength !== undefined) record.contextLength = dto.contextLength;
    if (dto.maxOutput !== undefined) record.maxOutput = dto.maxOutput;
    if (dto.priority !== undefined) record.priority = dto.priority;
    if (dto.weight !== undefined) record.weight = dto.weight;
    if (dto.remark !== undefined) record.remark = dto.remark;
    if (dto.status !== undefined) record.status = dto.status;
    const saved = await this.modelRepo.save(record);
    return this.toVo(saved);
  }

  async remove(id: number) {
    const record = await this.modelRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('模型不存在');
    }
    await this.modelRepo.remove(record);
    return { success: true };
  }

  /** 连通性测试：探测上游 /models，只回 ok 与消息。 */
  async test(id: number) {
    const { channel } = await this.resolveRow(id);
    const adapter = this.router.adapterFor(channel.type);
    if (!adapter) {
      return { ok: false, message: `不支持的协议类型：${channel.type}` };
    }
    try {
      const result = await adapter.probe(channel);
      return { ok: result.ok, message: result.message };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '连接失败' };
    }
  }

  /** 探测上游可用模型列表。 */
  async probeModels(id: number) {
    const { channel } = await this.resolveRow(id);
    const adapter = this.router.adapterFor(channel.type);
    if (!adapter) {
      return { ok: false, message: `不支持的协议类型：${channel.type}` };
    }
    try {
      return await adapter.probe(channel);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '探测失败' };
    }
  }

  private async resolveRow(id: number) {
    const record = await this.modelRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('模型不存在');
    }
    let apiKeyPlain: string;
    try {
      apiKeyPlain = decryptSecret(record.apiKeyCipher);
    } catch {
      throw new BadRequestException('密钥解密失败，请重新保存 API Key');
    }
    return {
      channel: {
        modelRowId: record.id,
        label: record.displayName,
        type: record.type,
        baseUrl: record.baseUrl.replace(/\/+$/, ''),
        apiKeyPlain,
        upstreamModel: record.modelKey
      }
    };
  }

  private assertEncryptionReady() {
    if (!isEncryptionConfigured()) {
      throw new BadRequestException('未配置 AI_ENCRYPTION_KEY，无法加密保存 API Key');
    }
  }

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, '');
  }

  /** 去重：同 model_key + 同 baseUrl 只允许一行（多上游用不同 baseUrl 表达）。 */
  private async assertNotDuplicated(modelKey: string, baseUrl: string, excludeId?: number) {
    const exists = await this.modelRepo.findOne({ where: { modelKey, baseUrl } });
    if (exists && exists.id !== excludeId) {
      throw new BadRequestException(`模型 ${modelKey} 在 ${baseUrl} 下已存在；如需多上游互备，请填写不同的请求地址`);
    }
  }

  private toVo(item: AiModel) {
    return {
      id: item.id,
      modelKey: item.modelKey,
      displayName: item.displayName,
      type: item.type,
      baseUrl: item.baseUrl,
      apiKeyMask: item.apiKeyMask,
      capabilities: item.capabilities.split(',').filter(Boolean),
      contextLength: item.contextLength,
      maxOutput: item.maxOutput,
      priority: item.priority,
      weight: item.weight,
      remark: item.remark,
      status: item.status,
      createdAt: item.createdAt
    };
  }
}
