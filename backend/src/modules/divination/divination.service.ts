// 占卜服务负责生成六爻、管理记录，并通过 SSE 提供流式解卦。
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
  OnModuleInit
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { Divination } from '../../common/entities/divination.entity';
import { DivinationLine } from '../../common/entities/divination-line.entity';
import { AiService } from '../ai/ai.service';
import { randomSigns } from './divination.util';
import { getHexagramNames } from './hexagram.util';

@Injectable()
export class DivinationService implements OnModuleInit {
  // 进行中的解卦流：同一记录的多个订阅者共享同一次 AI 调用。
  private readonly streams = new Map<number, Subject<MessageEvent>>();

  constructor(
    @InjectRepository(Divination)
    private readonly divinationRepo: Repository<Divination>,
    @InjectRepository(DivinationLine)
    private readonly lineRepo: Repository<DivinationLine>,
    private readonly aiService: AiService
  ) {}

  // 进程重启后历史遗留的"解卦中"记录已无对应流，统一标记失败便于用户重试。
  async onModuleInit() {
    await this.divinationRepo.update(
      { status: 'interpreting' },
      { status: 'failed', errorMessage: '解卦中断，请重新解读' }
    );
  }

  // 创建占卜：生成六爻并立即返回，不等待 AI。
  // 带主题则直接进入解卦流程（旧用法）；不带则先处于 casting，成卦后补填主题再解卦。
  async create(topic: string | undefined, userId?: number) {
    const generated = Array.from({ length: 6 }, () => randomSigns(3));
    const symbols = generated.map((line) => line.symbol);
    const { hexagramName, changedHexagramName } = getHexagramNames(symbols);
    const resolvedTopic = typeof topic === 'string' ? topic.trim().slice(0, 50) : '';

    const divination = await this.divinationRepo.save(
      this.divinationRepo.create({
        topic: resolvedTopic,
        userId,
        status: resolvedTopic ? 'interpreting' : 'casting',
        hexagramName,
        changedHexagramName: changedHexagramName ?? null
      })
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

  async getById(id: number, userId?: number) {
    const divination = await this.divinationRepo.findOne({
      where: { id },
      relations: ['lines']
    });
    if (!divination) {
      throw new NotFoundException('占卜记录不存在');
    }
    this.assertOwner(divination.userId, userId);
    return this.format(divination);
  }

  // 历史列表：只查当前用户的记录，返回摘要；分页参数防呆（非法值回落默认、pageSize 封顶）。
  async list(userId: number | undefined, page = 1, pageSize = 20) {
    const safePage = Math.max(1, Math.floor(Number(page)) || 1);
    const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize)) || 20));
    const builder = this.divinationRepo
      .createQueryBuilder('d')
      .orderBy('d.id', 'DESC')
      .skip((safePage - 1) * safePageSize)
      .take(safePageSize);
    if (userId != null) {
      builder.andWhere('d.user_id = :userId', { userId });
    }
    const [items, total] = await builder.getManyAndCount();
    return {
      items: items.map((item) => this.formatSummary(item)),
      total,
      page: safePage,
      pageSize: safePageSize
    };
  }

  // 补填主题：成卦后、解卦前填写所问之事；拒绝纯空白。
  async setTopic(id: number, topic: string, userId?: number) {
    const trimmed = typeof topic === 'string' ? topic.trim().slice(0, 50) : '';
    if (!trimmed) {
      throw new BadRequestException('请填写所问之事');
    }
    const record = await this.divinationRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('占卜记录不存在');
    }
    this.assertOwner(record.userId, userId);
    record.topic = trimmed;
    if (record.status === 'casting') {
      record.status = 'interpreting';
    }
    await this.divinationRepo.save(record);
    return this.format(record);
  }

  // 重新解读：失败或旧记录重新进入解卦流程，客户端随后重连 SSE。
  async reinterpret(id: number, userId?: number) {
    const record = await this.divinationRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('占卜记录不存在');
    }
    this.assertOwner(record.userId, userId);
    if (record.status === 'casting') {
      return { success: true, needsTopic: true };
    }
    if (record.status === 'interpreting') {
      return { success: true, alreadyRunning: true };
    }
    record.status = 'interpreting';
    record.errorMessage = null;
    await this.divinationRepo.save(record);
    this.streams.delete(id);
    return { success: true };
  }

  async remove(id: number, userId?: number) {
    const record = await this.divinationRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('占卜记录不存在');
    }
    this.assertOwner(record.userId, userId);
    await this.lineRepo.delete({ divinationId: id });
    await this.divinationRepo.delete(id);
    return { success: true };
  }

  // SSE 流式解卦：已完成直接下发全文；失败下发错误；进行中则实时推送 AI 分片。
  streamInterpretation(id: number, userId?: number): Observable<MessageEvent> {
    const existing = this.streams.get(id);
    if (existing) {
      return existing.asObservable();
    }
    const subject = new Subject<MessageEvent>();
    this.streams.set(id, subject);
    void this.runInterpretationStream(id, subject, userId);
    return subject.asObservable();
  }

  private async runInterpretationStream(id: number, subject: Subject<MessageEvent>, userId?: number) {
    try {
      const record = await this.divinationRepo.findOne({
        where: { id },
        relations: ['lines']
      });
      if (!record) {
        subject.next({ type: 'error', data: { message: '占卜记录不存在' } });
        return;
      }
      if (record.userId != null && userId != null && record.userId !== userId) {
        subject.next({ type: 'error', data: { message: '无权查看该占卜记录' } });
        return;
      }
      if (record.status === 'casting') {
        subject.next({ type: 'error', data: { message: '请先填写所问之事' } });
        return;
      }
      if (record.status === 'completed') {
        subject.next({ type: 'chunk', data: { text: record.interpretation ?? '' } });
        subject.next({ type: 'done', data: { status: 'completed' } });
        return;
      }
      if (record.status === 'failed') {
        subject.next({ type: 'error', data: { message: record.errorMessage ?? '解读暂不可用' } });
        return;
      }

      const lines = [...(record.lines ?? [])]
        .sort((a, b) => a.lineIndex - b.lineIndex)
        .map((line) => ({
          signStr: line.signStr,
          symbol: line.symbol,
          name: line.name,
          sum: line.sum
        }));

      const hexagram = {
        hexagramName: record.hexagramName,
        changedHexagramName: record.changedHexagramName
      };

      let full = '';
      try {
        for await (const delta of this.aiService.interpretStream(lines, record.topic, hexagram)) {
          full += delta;
          subject.next({ type: 'chunk', data: { text: delta } });
        }
      } catch (error) {
        if (!full) {
          throw error;
        }
        // 已输出部分内容则按现有内容收尾。
      }
      if (!full) {
        throw new Error('解卦内容为空');
      }

      await this.divinationRepo.update(id, {
        interpretation: full,
        status: 'completed',
        errorMessage: null
      });
      subject.next({ type: 'done', data: { status: 'completed' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '解卦失败';
      try {
        await this.divinationRepo.update(id, {
          status: 'failed',
          errorMessage: message.slice(0, 255)
        });
      } catch {
        // 状态回写失败时仍需向前端下发错误事件。
      }
      subject.next({ type: 'error', data: { message } });
    } finally {
      this.streams.delete(id);
      subject.complete();
    }
  }

  private assertOwner(recordUserId: number | undefined | null, userId: number | undefined) {
    if (recordUserId != null && userId != null && recordUserId !== userId) {
      throw new ForbiddenException('只能操作自己的占卜记录');
    }
  }

  private format(divination: Divination) {
    const lines = [...(divination.lines ?? [])].sort((a, b) => a.lineIndex - b.lineIndex);
    return {
      id: divination.id,
      topic: divination.topic,
      status: divination.status,
      hexagramName: divination.hexagramName,
      changedHexagramName: divination.changedHexagramName,
      errorMessage: divination.errorMessage,
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

  private formatSummary(divination: Divination) {
    return {
      id: divination.id,
      topic: divination.topic,
      status: divination.status,
      hexagramName: divination.hexagramName,
      changedHexagramName: divination.changedHexagramName,
      createdAt: divination.createdAt
    };
  }
}
