// 占卜服务用于生成六爻与调用 AI 解卦。
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Divination } from '../../common/entities/divination.entity';
import { DivinationLine } from '../../common/entities/divination-line.entity';
import { AiService } from '../ai/ai.service';
import { randomSigns } from './divination.util';

@Injectable()
export class DivinationService {
  constructor(
    @InjectRepository(Divination)
    private readonly divinationRepo: Repository<Divination>,
    @InjectRepository(DivinationLine)
    private readonly lineRepo: Repository<DivinationLine>,
    private readonly aiService: AiService
  ) {}

  async create(topic: string, userId?: number) {
    const generated = Array.from({ length: 6 }, () => randomSigns(3));
    const interpretation = await this.aiService.interpret(
      generated.map((line) => ({
        signStr: line.signStr,
        symbol: line.symbol,
        name: line.name,
        sum: line.sum
      })),
      topic
    );

    const divination = await this.divinationRepo.save(
      this.divinationRepo.create({ topic, interpretation, userId })
    );

    const lineEntities = generated.map((line, index) =>
      this.lineRepo.create({
        lineIndex: index,
        signStr: line.signStr,
        sum: line.sum,
        symbol: line.symbol,
        name: line.name,
        divinationId: divination.id,
        divination
      })
    );
    await this.lineRepo.save(lineEntities);
    divination.lines = lineEntities;
    return this.format(divination);
  }

  async getById(id: number) {
    const divination = await this.divinationRepo.findOne({
      where: { id },
      relations: ['lines']
    });
    if (!divination) {
      throw new NotFoundException('占卜记录不存在');
    }
    return this.format(divination);
  }

  private format(divination: Divination) {
    const lines = [...(divination.lines ?? [])].sort((a, b) => a.lineIndex - b.lineIndex);
    return {
      id: divination.id,
      topic: divination.topic,
      interpretation: divination.interpretation,
      lines: lines.map((line) => ({
        lineIndex: line.lineIndex,
        signStr: line.signStr,
        sum: line.sum,
        symbol: line.symbol,
        name: line.name
      })),
      createdAt: divination.createdAt
    };
  }
}
