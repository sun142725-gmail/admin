// 模型单价管理服务：报表计价的价目来源（同 kind/modelId 多行按生效时间共存）。
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModelPrice } from '../../../common/entities/ai-model-price.entity';
import { DEFAULT_UNIT_BY_KIND, PriceKind } from '../core/usage-cost.util';
import { CreateModelPriceDto, UpdateModelPriceDto } from './dto/ai-admin.dto';

@Injectable()
export class AiModelPricesService {
  constructor(
    @InjectRepository(AiModelPrice) private readonly priceRepo: Repository<AiModelPrice>
  ) {}

  async list(modelId?: number, kind?: string) {
    const where: Record<string, unknown> = {};
    if (modelId !== undefined) {
      where.modelId = modelId;
    }
    if (kind) {
      where.kind = kind;
    }
    const items = await this.priceRepo.find({
      where,
      order: { effectiveFrom: 'DESC', id: 'DESC' }
    });
    return items.map((item) => this.toVo(item));
  }

  async create(dto: CreateModelPriceDto) {
    const entity = this.priceRepo.create({
      modelId: dto.modelId,
      kind: dto.kind,
      // decimal 写 String、读 Number（先例 agents.service.ts temperature/topP）。
      inputPrice: String(dto.inputPrice ?? 0),
      outputPrice: String(dto.outputPrice ?? 0),
      // 计价单位缺省由 kind 决定。
      unit: dto.unit ?? DEFAULT_UNIT_BY_KIND[dto.kind as PriceKind],
      currency: dto.currency?.trim() || 'CNY',
      effectiveFrom: new Date(dto.effectiveFrom),
      remark: dto.remark
    });
    const saved = await this.priceRepo.save(entity);
    return this.toVo(saved);
  }

  async update(id: number, dto: UpdateModelPriceDto) {
    const record = await this.priceRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('价格行不存在');
    }
    if (dto.modelId !== undefined) record.modelId = dto.modelId;
    if (dto.kind !== undefined) record.kind = dto.kind;
    if (dto.inputPrice !== undefined) record.inputPrice = String(dto.inputPrice);
    if (dto.outputPrice !== undefined) record.outputPrice = String(dto.outputPrice);
    if (dto.unit !== undefined) record.unit = dto.unit;
    if (dto.currency !== undefined) record.currency = dto.currency.trim();
    if (dto.effectiveFrom !== undefined) record.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.remark !== undefined) record.remark = dto.remark;
    const saved = await this.priceRepo.save(record);
    return this.toVo(saved);
  }

  async remove(id: number) {
    const record = await this.priceRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('价格行不存在');
    }
    await this.priceRepo.remove(record);
    return { success: true };
  }

  private toVo(item: AiModelPrice) {
    return {
      id: item.id,
      modelId: item.modelId ?? null,
      kind: item.kind,
      inputPrice: Number(item.inputPrice),
      outputPrice: Number(item.outputPrice),
      unit: item.unit,
      currency: item.currency,
      effectiveFrom: item.effectiveFrom,
      remark: item.remark,
      createdAt: item.createdAt
    };
  }
}
