// 圆桌编排：两段式流（POST 预启动 + GET SSE 订阅共享/重放），
// 流程 = 数据准备 → 第一轮并行独立分析 → 辩论轮串行发言 → 主席总结，全程事件流。
// 复用 ai/chat 验证过的模式：Map 共享 Subject + 完成后重放 + 部分输出收尾 + TTL 清理。
import {
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StockRoundtable } from '../../common/entities/stock-roundtable.entity';
import { StockRoundtableTurn } from '../../common/entities/stock-roundtable-turn.entity';
import { IndicatorSummary, summarizeIndicators } from './indicators.util';
import { MarketDataService, MarketOverview } from './market/market-data.service';
import { ThsFinancials } from './market/ths-f10.api';
import { QuoteSnapshot, normalizeSymbol } from './market/tencent-quote.api';
import {
  DISCLAIMER,
  EXPERT_DEFINITIONS,
  ExpertDefinition,
  Stance,
  StanceDigest,
  buildDebatePrompt,
  buildModeratorPrompt,
  buildRound1Prompt,
  computeDebateConvergence,
  directionLabel,
  localModeratorReport,
  localRound1,
  parseConclusion,
  parseStance,
  renderBriefText
} from './experts.definitions';
import { ExpertsService } from './experts.service';
import { CreateRoundtableDto } from './dto/create-roundtable.dto';

const STREAM_TTL_MS = 10 * 60 * 1000;
const PER_CALL_BUDGET_MS = 90 * 1000;
// deep 模式最多 4 轮串行辩论（4×5×90s 上限），10 分钟保证其可完整跑完。
const SESSION_DEADLINE_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 3000;

interface RoundtableStreamState {
  subject: Subject<MessageEvent>;
  events: MessageEvent[];
  done: boolean;
  errorMessage?: string;
}

interface TurnOutcome {
  def: ExpertDefinition;
  round: number;
  ok: boolean;
  source?: 'llm' | 'local';
  modelLabel?: string;
  content?: string;
  stance?: Stance | null;
}

interface VoteTally {
  bull: number;
  bear: number;
  neutral: number;
}

const TERMINAL_STATUSES = ['completed', 'failed'];
const RUNNING_STATUSES = ['preparing', 'round1', 'debating', 'summarizing'];

@Injectable()
export class RoundtableService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoundtableService.name);
  private readonly streams = new Map<number, RoundtableStreamState>();
  private readonly ttlTimers = new Map<number, NodeJS.Timeout>();
  private readonly heartbeatTimers = new Map<number, NodeJS.Timeout>();
  private readonly lastEmitAt = new Map<number, number>();

  constructor(
    @InjectRepository(StockRoundtable) private readonly rtRepo: Repository<StockRoundtable>,
    @InjectRepository(StockRoundtableTurn) private readonly turnRepo: Repository<StockRoundtableTurn>,
    private readonly market: MarketDataService,
    private readonly experts: ExpertsService
  ) {}

  async onModuleInit() {
    // 服务重启：把遗留的进行中会议标记为失败，避免前端无限等待。
    try {
      await this.rtRepo.update(
        { status: In(RUNNING_STATUSES) },
        { status: 'failed', errorMessage: '服务重启，会议已中断' }
      );
    } catch {
      // 表尚未同步完成等场景忽略。
    }
  }

  onModuleDestroy() {
    this.ttlTimers.forEach((timer) => clearTimeout(timer));
    this.heartbeatTimers.forEach((timer) => clearInterval(timer));
    this.streams.forEach((state) => {
      if (!state.done) {
        state.done = true;
        state.subject.complete();
      }
    });
    this.streams.clear();
  }

  // ---------- 对外接口 ----------

  /** 第一步：创建会议并后台启动编排，立即返回会议 ID。 */
  async create(userId: number | undefined, dto: CreateRoundtableDto): Promise<{ id: number }> {
    const subjectType = dto.subjectType;
    let subjectCode: string | null = null;
    let subjectName: string;

    try {
      if (subjectType === 'market') {
        subjectCode = 'sh000001';
        subjectName = 'A股大盘';
      } else if (subjectType === 'index' || subjectType === 'stock') {
        if (!dto.symbol) {
          throw new BadRequestException('请提供指数/股票代码');
        }
        subjectCode = normalizeSymbol(dto.symbol);
        const snapshot = await this.market.quote(subjectCode);
        subjectName = snapshot.name || subjectCode;
        if (subjectType === 'stock' && snapshot.name.includes('指数')) {
          throw new BadRequestException('该代码是指数，请选择指数类型');
        }
      } else if (subjectType === 'sector') {
        const code = dto.symbol?.trim() ?? '';
        // 双体系板块代码：东财 BKxxxx / 新浪 new_xxx。
        if (!/^(BK\d{4,6}|new_[a-z0-9_]+)$/i.test(code)) {
          throw new BadRequestException('请提供板块代码（BK 或 new_ 开头，从搜索结果中选择）');
        }
        subjectCode = code;
        const info = await this.market.sectorInfo(subjectCode);
        if (!info) {
          throw new BadRequestException('未找到该板块或板块数据源暂不可用，请稍后重试');
        }
        subjectName = info.name;
      } else {
        throw new BadRequestException('不支持的分析对象类型');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('行情数据暂不可用，无法创建会议，请稍后重试');
    }

    const row = await this.rtRepo.save(
      this.rtRepo.create({
        userId: userId ?? 0,
        subjectType,
        subjectCode,
        subjectName,
        question: dto.question?.trim() || null,
        mode: dto.mode ?? 'standard',
        modelId: dto.modelId ?? null,
        status: 'preparing'
      })
    );

    // 同步注册流状态，保证 create 返回后 stream 订阅一定能命中。
    const state: RoundtableStreamState = {
      subject: new Subject<MessageEvent>(),
      events: [],
      done: false
    };
    this.streams.set(row.id, state);
    this.startHeartbeat(row.id);
    void this.runSession(row.id);
    return { id: row.id };
  }

  /** 第二步：GET SSE 订阅会议流（进行中共享；已结束重放事件缓冲或落库内容）。 */
  stream(id: number, userId: number | undefined): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      void this.resolveStream(id, userId)
        .then((observable) => observable.subscribe(subscriber))
        .catch((error: unknown) => {
          subscriber.next({
            type: 'error',
            data: { message: error instanceof Error ? error.message : '订阅失败' }
          });
          subscriber.complete();
        });
      return () => {
        // 断开由内层 subject.complete() 自然收尾。
      };
    });
  }

  private async resolveStream(id: number, userId: number | undefined): Promise<Observable<MessageEvent>> {
    const row = await this.ownedRoundtable(id, userId);
    const state = this.streams.get(id);
    if (!state) {
      return this.replayFromDb(row);
    }
    if (state.done) {
      return this.replayState(state);
    }
    return this.liveWithReplay(state);
  }

  /**
   * 实时订阅 + 事件缓冲回放：Subject 不回放历史，迟到订阅者先补发已缓冲事件再接续实时流。
   * emit() 同步先入 events 再 next，故按游标顺序 flush 不会丢事件也不会重复。
   */
  private liveWithReplay(state: RoundtableStreamState): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let cursor = 0;
      const flush = () => {
        while (cursor < state.events.length) {
          subscriber.next(state.events[cursor]);
          cursor += 1;
        }
      };
      const subscription = state.subject.subscribe({
        next: () => flush(),
        error: (error) => subscriber.error(error),
        complete: () => {
          flush();
          subscriber.complete();
        }
      });
      flush();
      return () => subscription.unsubscribe();
    });
  }

  private replayState(state: RoundtableStreamState): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    setTimeout(() => {
      state.events.forEach((event) => subject.next(event));
      subject.complete();
    }, 0);
    return subject.asObservable();
  }

  /** 进程内无任务（重启/过期）：按落库内容回放一版精简事件流。 */
  private replayFromDb(row: StockRoundtable): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    setTimeout(() => {
      const emit = (type: string, data: unknown) => subject.next({ type, data: data as object });
      if (TERMINAL_STATUSES.includes(row.status)) {
        if (row.briefJson) {
          try {
            emit('brief', JSON.parse(row.briefJson));
          } catch {
            // 简报损坏时跳过。
          }
        }
        void this.turnRepo
          .find({ where: { roundtableId: row.id }, order: { round: 'ASC', id: 'ASC' } })
          .then((turns) => {
            turns.forEach((turn) => {
              emit('expert_done', {
                round: turn.round,
                code: turn.expertCode,
                name: turn.expertName,
                stance: turn.stanceJson ? JSON.parse(turn.stanceJson) : null,
                content: turn.content ?? '',
                replay: true
              });
            });
            if (row.consensusJson) {
              try {
                emit('vote', JSON.parse(row.consensusJson).votes);
              } catch {
                // 忽略。
              }
            }
            if (row.summaryText) {
              emit('summary_chunk', { text: row.summaryText, replay: true });
            }
            if (row.status === 'failed') {
              emit('error', { message: row.errorMessage ?? '会议失败' });
            } else {
              emit('done', { status: 'completed', roundtableId: row.id });
            }
            subject.complete();
          })
          .catch(() => {
            emit('error', { message: '会议记录读取失败' });
            subject.complete();
          });
      } else {
        emit('error', { message: '会议任务不存在或已过期' });
        subject.complete();
      }
    }, 0);
    return subject.asObservable();
  }

  async list(userId: number | undefined, page = 1, pageSize = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const [rows, total] = await this.rtRepo.findAndCount({
      where: { userId: userId ?? 0 },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize
    });
    const items = rows.map((row) => ({
      id: row.id,
      subjectType: row.subjectType,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      question: row.question,
      mode: row.mode,
      modelId: row.modelId,
      status: row.status,
      errorMessage: row.errorMessage,
      consensus: row.consensusJson ? safeParse(row.consensusJson) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async getById(id: number, userId: number | undefined) {
    const row = await this.ownedRoundtable(id, userId);
    const turns = await this.turnRepo.find({
      where: { roundtableId: id },
      order: { round: 'ASC', id: 'ASC' }
    });
    return {
      id: row.id,
      subjectType: row.subjectType,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      question: row.question,
      mode: row.mode,
      modelId: row.modelId,
      status: row.status,
      errorMessage: row.errorMessage,
      brief: row.briefJson ? safeParse(row.briefJson) : null,
      summaryText: row.summaryText,
      consensus: row.consensusJson ? safeParse(row.consensusJson) : null,
      createdAt: row.createdAt,
      turns: turns.map((turn) => ({
        id: turn.id,
        round: turn.round,
        expertCode: turn.expertCode,
        expertName: turn.expertName,
        content: turn.content,
        stance: turn.stanceJson ? safeParse(turn.stanceJson) : null,
        status: turn.status,
        createdAt: turn.createdAt
      }))
    };
  }

  async remove(id: number, userId: number | undefined) {
    await this.ownedRoundtable(id, userId);
    await this.rtRepo.delete(id);
    this.cleanup(id);
    return { id };
  }

  private async ownedRoundtable(id: number, userId: number | undefined): Promise<StockRoundtable> {
    const row = await this.rtRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('会议记录不存在');
    }
    if (row.userId !== (userId ?? 0)) {
      throw new ForbiddenException('无权访问该会议记录');
    }
    return row;
  }

  // ---------- 编排 ----------

  private emit(id: number, type: string, data: unknown) {
    const state = this.streams.get(id);
    if (!state || state.done) {
      return;
    }
    const event: MessageEvent = { type, data: data as Record<string, unknown> };
    state.events.push(event);
    this.lastEmitAt.set(id, Date.now());
    state.subject.next(event);
  }

  // 心跳：空闲超过 3 秒时推送 thinking，保持连接活性与前端等待反馈。
  private startHeartbeat(id: number) {
    const timer = setInterval(() => {
      const state = this.streams.get(id);
      if (!state || state.done) {
        return;
      }
      const lastAt = this.lastEmitAt.get(id) ?? Date.now();
      if (Date.now() - lastAt >= HEARTBEAT_INTERVAL_MS) {
        const heartbeat: MessageEvent = { type: 'thinking', data: { elapsedMs: Date.now() - lastAt } };
        state.subject.next(heartbeat);
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimers.set(id, timer);
  }

  private cleanup(id: number) {
    const state = this.streams.get(id);
    if (state && !state.done) {
      state.done = true;
      state.subject.complete();
    }
    const heartbeat = this.heartbeatTimers.get(id);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.heartbeatTimers.delete(id);
    }
    // 事件缓冲（含全部专家输出文本）与心跳时间戳必须一并移除，
    // 否则删除会议后这些条目会滞留内存直到进程重启
    this.streams.delete(id);
    this.lastEmitAt.delete(id);
  }

  private finish(id: number, errorMessage?: string) {
    const state = this.streams.get(id);
    if (state && !state.done) {
      state.done = true;
      if (errorMessage) {
        state.subject.next({ type: 'error', data: { message: errorMessage } });
      }
      state.subject.complete();
    }
    const heartbeat = this.heartbeatTimers.get(id);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.heartbeatTimers.delete(id);
    }
    const timer = setTimeout(() => {
      this.streams.delete(id);
      this.lastEmitAt.delete(id);
      this.ttlTimers.delete(id);
    }, STREAM_TTL_MS);
    this.ttlTimers.set(id, timer);
  }

  private async runSession(id: number) {
    const deadline = Date.now() + SESSION_DEADLINE_MS;
    try {
      const row = await this.rtRepo.findOne({ where: { id } });
      if (!row) {
        throw new Error('会议记录不存在');
      }

      // ---- 阶段一：数据准备 ----
      this.emit(id, 'stage', { stage: 'preparing', label: '数据准备' });
      const brief = await this.buildBrief(row);
      await this.rtRepo.update(id, {
        status: 'round1',
        briefJson: JSON.stringify(brief.briefJson)
      });
      this.emit(id, 'brief', { ...brief.briefJson, subjectName: row.subjectName });

      // ---- 阶段二：第一轮独立分析（并行，错峰 250ms 降低免费渠道并发尖峰） ----
      this.emit(id, 'stage', { stage: 'round1', label: '第一轮·独立分析' });
      const round1Prompt = buildRound1Prompt(brief.briefText, row.subjectName, row.question);
      const outcomes: TurnOutcome[] = [];
      await Promise.all(
        EXPERT_DEFINITIONS.map(async (def, index) => {
          if (index > 0) {
            await new Promise((resolve) => setTimeout(resolve, index * 250));
          }
          const outcome = await this.runExpertTurn(id, row, def, 1, round1Prompt, brief, deadline, {
            preferredModelId: row.modelId
          });
          outcomes.push(outcome);
        })
      );
      const okOutcomes = outcomes.filter((o) => o.ok);
      this.emit(id, 'vote', { round: 1, tally: this.tally(okOutcomes), stances: this.stanceList(outcomes) });
      if (okOutcomes.length === 0) {
        throw new Error('所有专家均未能完成分析，请检查模型配置后重试');
      }

      // ---- 阶段三：辩论轮（串行，风控专家压轴；动态收敛：无人翻转立场即达平衡点） ----
      // quick 不辩论；standard 起始 1 轮、deep 起始 2 轮，未收敛最多各加 2 轮（封顶 4）。
      const minDebateRounds = row.mode === 'quick' ? 0 : row.mode === 'deep' ? 2 : 1;
      const maxDebateRounds = Math.min(minDebateRounds + 2, 4);
      const debateExperts = EXPERT_DEFINITIONS.filter((def) => {
        const first = okOutcomes.find((o) => o.def.code === def.code);
        return first?.source === 'llm';
      });
      // 辩论跳过：模式要求辩论但第一轮没有任何 LLM 专家（纯规则不开辩论，或时间耗尽）。
      const debateSkipped = minDebateRounds > 0 && debateExperts.length < 2;
      let convergenceInfo: { rounds: number; stanceShift: number; converged: boolean } | undefined;
      let debateRound = 0;
      while (debateRound < maxDebateRounds && debateExperts.length >= 2) {
        if (Date.now() > deadline - 30 * 1000) {
          break;
        }
        debateRound += 1;
        await this.rtRepo.update(id, { status: 'debating' });
        this.emit(id, 'stage', { stage: 'debating', round: debateRound + 1, label: `辩论轮·第 ${debateRound + 1} 轮` });
        for (const def of debateExperts) {
          if (Date.now() > deadline - 15 * 1000) {
            break;
          }
          const digests = await this.loadStanceDigests(id);
          const prompt = buildDebatePrompt(brief.briefText, row.subjectName, debateRound + 1, digests, row.question);
          const outcome = await this.runExpertTurn(id, row, def, debateRound + 1, prompt, brief, deadline, {
            debate: true,
            preferredModelId: row.modelId
          });
          outcomes.push(outcome);
        }
        const currentOk = outcomes.filter((o) => o.ok);
        this.emit(id, 'vote', { round: debateRound + 1, tally: this.tally(currentOk), stances: this.stanceList(outcomes) });
        // 基础轮次打满后做收敛检测：无人翻转立场 = 相对平衡点，提前交主席裁决。
        if (debateRound >= minDebateRounds) {
          const turnsForCheck = outcomes.map((o) => ({
            expertCode: o.def.code,
            round: o.round,
            ok: o.ok,
            stance: o.stance ?? null
          }));
          const check = computeDebateConvergence(turnsForCheck, debateRound + 1);
          convergenceInfo = { rounds: debateRound, stanceShift: check.stanceShift, converged: check.converged };
          this.emit(id, 'convergence', {
            round: debateRound + 1,
            ...check,
            tally: this.tally(currentOk),
            reason: check.converged ? '立场已收敛，达到相对平衡点' : '仍有立场翻转，继续辩论'
          });
          if (check.converged) {
            break;
          }
        }
      }

      // ---- 阶段四：主席总结 ----
      await this.rtRepo.update(id, { status: 'summarizing' });
      this.emit(id, 'stage', { stage: 'summarizing', label: '主席总结' });
      const finalOutcomes = outcomes.filter((o) => o.ok);
      const moderatorResult = await this.runModerator(id, row, finalOutcomes, deadline, row.modelId, convergenceInfo);

      const votes = this.tally(finalOutcomes);
      const stances = this.stanceList(outcomes);
      const conclusion = moderatorResult.conclusion ?? this.votesToConclusion(votes);
      // 生成引擎统计：命中模型 / 本地规则占比，供前端明确标注本次纪要由谁生成。
      const engineCalls = [...finalOutcomes, moderatorResult as unknown as TurnOutcome];
      const llmCount = engineCalls.filter((o) => o.source === 'llm').length;
      const localCount = engineCalls.filter((o) => o.source === 'local').length;
      const engine = {
        degraded: localCount > 0,
        debateSkipped,
        llmCount,
        localCount,
        models: [...new Set(engineCalls.filter((o) => o.modelLabel).map((o) => o.modelLabel as string))]
      };
      const consensus = {
        conclusion,
        conclusionLabel: { bull: '看多', bear: '看空', neutral: '中性', watch: '观望' }[conclusion],
        votes,
        stances,
        engine
      };
      this.emit(id, 'summary_done', consensus);
      await this.rtRepo.update(id, {
        status: 'completed',
        summaryText: moderatorResult.content,
        consensusJson: JSON.stringify(consensus)
      });
      this.emit(id, 'done', { status: 'completed', roundtableId: id });
      this.finish(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : '会议执行失败';
      this.logger.warn(`圆桌会议 ${id} 失败: ${message}`);
      await this.rtRepo
        .update(id, { status: 'failed', errorMessage: message.slice(0, 255) })
        .catch(() => undefined);
      this.finish(id, message);
    }
  }

  private async buildBrief(row: StockRoundtable): Promise<{ briefText: string; briefJson: Record<string, unknown> }> {
    const overview: MarketOverview | null = await this.market.overview().catch(() => null);
    let snapshot: QuoteSnapshot | null = null;
    let summary: IndicatorSummary | null = null;
    let sectorInfo: Record<string, unknown> | null = null;
    let constituents: Array<{ name: string; pct: number | null }> | null = null;
    let announcements: Array<{ title: string; date: string }> | null = null;
    let financials: ThsFinancials | null = null;
    let newsDigest: string | null = null;

    if (row.subjectType === 'sector' && row.subjectCode) {
      // 板块 K 线仅东财支持：拿不到时降级为"板块概况 + 成分股聚合"简报（无技术指标），会议照常进行。
      const info = await this.market.sectorInfo(row.subjectCode);
      constituents = await this.market.sectorConstituents(row.subjectCode, 10).catch(() => []);
      const kline = await this.market.kline(row.subjectCode, 250).catch(() => null);
      if (kline) {
        summary = summarizeIndicators(kline.items);
      }
      sectorInfo = info
        ? {
            name: info.name,
            pct: info.pct,
            upCount: info.upCount,
            downCount: info.downCount,
            leaderName: info.leaderName,
            note: summary ? undefined : '板块 K 线暂缺，以下为成分股聚合视图'
          }
        : null;
    } else {
      const symbol = row.subjectCode ?? 'sh000001';
      const kline = await this.market.kline(symbol, 250);
      summary = summarizeIndicators(kline.items);
      if (row.subjectType !== 'market') {
        snapshot = await this.market.quote(symbol).catch(() => null);
      } else {
        snapshot = overview?.indexes.find((idx) => idx.symbol === 'sh000001') ?? null;
      }
      if (row.subjectType === 'stock') {
        // 消息面第一档：巨潮官方公告；第二档：同花顺 F10 财务字段（均为 best-effort）。
        announcements = await this.market.announcements(symbol, 8).catch(() => []);
        financials = await this.market.financials(symbol).catch(() => null);
        // 第三档兜底：公告拿不到且模型可用时，让模型联网检索（或基于常识标注时效）。
        if ((announcements?.length ?? 0) === 0) {
          newsDigest = await this.experts
            .researchNews({
              subjectName: row.subjectName,
              symbol: row.subjectCode,
              announcements: [],
              userId: row.userId ?? 0
            })
            .catch(() => null);
        }
      }
    }

    const dateText = new Date().toLocaleDateString('zh-CN');
    const briefText = renderBriefText({
      subjectName: row.subjectName,
      subjectType: row.subjectType,
      snapshot,
      summary,
      overview,
      sectorInfo: sectorInfo as never,
      constituents,
      announcements,
      financials: financials as never,
      newsDigest,
      dateText
    });
    return {
      briefText,
      briefJson: {
        subjectType: row.subjectType,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        snapshot,
        summary,
        sectorInfo,
        constituents,
        announcements,
        financials,
        newsDigest,
        overview: overview
          ? {
              indexes: overview.indexes.map((idx) => ({
                symbol: idx.symbol,
                name: idx.name,
                price: idx.price,
                changePct: idx.changePct
              })),
              breadth: overview.breadth,
              topSectors: overview.topSectors.slice(0, 5),
              bottomSectors: overview.bottomSectors.slice(0, 5)
            }
          : null
      }
    };
  }

  private async runExpertTurn(
    id: number,
    row: StockRoundtable,
    def: ExpertDefinition,
    round: number,
    prompt: string,
    brief: { briefText: string; briefJson: Record<string, unknown> },
    deadline: number,
    options: { debate?: boolean; preferredModelId?: number | null } = {}
  ): Promise<TurnOutcome> {
    this.emit(id, 'expert_start', { round, code: def.code, name: def.name, school: def.school });
    const budget = Math.max(5 * 1000, Math.min(PER_CALL_BUDGET_MS, deadline - Date.now() - 2000));
    try {
      const result = await this.experts.streamAnalysis({
        def,
        userPrompt: prompt,
        userId: row.userId ?? 0,
        onDelta: (text) => this.emit(id, 'chunk', { round, code: def.code, text }),
        fallback: options.debate
          ? undefined
          : () => {
              const summary = (brief.briefJson.summary ?? null) as IndicatorSummary | null;
              const snapshot = (brief.briefJson.snapshot ?? null) as QuoteSnapshot | null;
              // 板块降级简报无指标时 summary 为 null，localRound1 会给出定性兜底。
              return localRound1(def, summary, snapshot).content;
            },
        budgetMs: budget,
        preferredModelId: options.preferredModelId
      });

      let stance = parseStance(result.content);
      if (!stance && options.debate) {
        // 辩论轮输出未带标签时沿用此前立场。
        const previous = await this.previousStance(id, def.code);
        stance = previous;
      }
      await this.turnRepo.save(
        this.turnRepo.create({
          roundtableId: id,
          round,
          expertCode: def.code,
          expertName: `${def.school}·${def.name}`,
          content: result.content,
          stanceJson: stance ? JSON.stringify(stance) : null,
          status: 'ok'
        })
      );
      this.emit(id, 'expert_done', {
        round,
        code: def.code,
        name: def.name,
        stance,
        source: result.source,
        modelLabel: result.modelLabel
      });
      return {
        def,
        round,
        ok: true,
        source: result.source,
        modelLabel: result.modelLabel,
        content: result.content,
        stance
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      this.emit(id, 'expert_error', { round, code: def.code, name: def.name, message });
      await this.turnRepo
        .save(
          this.turnRepo.create({
            roundtableId: id,
            round,
            expertCode: def.code,
            expertName: `${def.school}·${def.name}`,
            content: null,
            stanceJson: null,
            status: 'failed'
          })
        )
        .catch(() => undefined);
      return { def, round, ok: false };
    }
  }

  private async runModerator(
    id: number,
    row: StockRoundtable,
    outcomes: TurnOutcome[],
    deadline: number,
    preferredModelId?: number | null,
    convergence?: { rounds: number; stanceShift: number; converged: boolean }
  ): Promise<{
    content: string;
    conclusion: ReturnType<typeof parseConclusion>;
    source: 'llm' | 'local';
    modelLabel?: string;
  }> {
    const moderatorDef = this.experts.moderatorDefinition;
    const turnsForPrompt = outcomes.map((o) => ({
      expertName: o.def.name,
      school: o.def.school,
      round: o.round,
      direction: o.stance?.direction,
      confidence: o.stance?.confidence,
      content: o.content ?? ''
    }));
    const prompt = buildModeratorPrompt(row.subjectName, row.question, turnsForPrompt, convergence);
    const budget = Math.max(5 * 1000, Math.min(PER_CALL_BUDGET_MS, deadline - Date.now() - 2000));

    const result = await this.experts.streamAnalysis({
      def: moderatorDef,
      userPrompt: prompt,
      userId: row.userId ?? 0,
      onDelta: (text) => this.emit(id, 'summary_chunk', { text }),
      fallback: () =>
        localModeratorReport(
          row.subjectName,
          outcomes
            .filter((o) => o.stance)
            .map((o) => ({ expertName: o.def.name, school: o.def.school, stance: o.stance as Stance })),
          row.question
        ),
      budgetMs: budget,
      preferredModelId
    });

    let content = result.content?.trim() ?? '';
    if (!content.includes(DISCLAIMER)) {
      const tail = `\n\n——\n${DISCLAIMER}`;
      this.emit(id, 'summary_chunk', { text: tail });
      content += tail;
    }
    return {
      content,
      conclusion: parseConclusion(content),
      source: result.source,
      modelLabel: result.modelLabel
    };
  }

  // ---------- 投票与立场 ----------

  private tally(outcomes: TurnOutcome[]): VoteTally {
    const latest = this.latestStances(outcomes);
    return {
      bull: latest.filter((s) => s.stance.direction === 'bull').length,
      bear: latest.filter((s) => s.stance.direction === 'bear').length,
      neutral: latest.filter((s) => s.stance.direction === 'neutral').length
    };
  }

  private stanceList(outcomes: TurnOutcome[]): Array<{ code: string; name: string; direction: string; label: string; confidence: number; keyPoints: string; round: number }> {
    return this.latestStances(outcomes).map((s) => ({
      code: s.def.code,
      name: s.def.name,
      direction: s.stance.direction,
      label: directionLabel(s.stance.direction),
      confidence: s.stance.confidence,
      keyPoints: s.stance.keyPoints,
      round: s.round
    }));
  }

  /** 每位专家取最高轮次的可用立场。 */
  private latestStances(outcomes: TurnOutcome[]): Array<{ def: ExpertDefinition; round: number; stance: Stance }> {
    const map = new Map<string, { def: ExpertDefinition; round: number; stance: Stance }>();
    for (const outcome of outcomes) {
      if (!outcome.ok || !outcome.stance) {
        continue;
      }
      const existing = map.get(outcome.def.code);
      if (!existing || outcome.round > existing.round) {
        map.set(outcome.def.code, { def: outcome.def, round: outcome.round, stance: outcome.stance });
      }
    }
    return [...map.values()];
  }

  private votesToConclusion(votes: VoteTally): 'bull' | 'bear' | 'watch' {
    if (votes.bull - votes.bear >= 2) {
      return 'bull';
    }
    if (votes.bear - votes.bull >= 2) {
      return 'bear';
    }
    return 'watch';
  }

  private async previousStance(roundtableId: number, expertCode: string): Promise<Stance | null> {
    const turns = await this.turnRepo.find({ where: { roundtableId, expertCode } });
    const ok = turns.filter((t) => t.status === 'ok' && t.stanceJson).sort((a, b) => b.round - a.round);
    if (ok.length === 0) {
      return null;
    }
    try {
      return JSON.parse(ok[0].stanceJson as string) as Stance;
    } catch {
      return null;
    }
  }

  private async loadStanceDigests(roundtableId: number): Promise<StanceDigest[]> {
    const turns = await this.turnRepo.find({
      where: { roundtableId, status: 'ok' },
      order: { round: 'ASC', id: 'ASC' }
    });
    return turns
      .filter((turn) => turn.stanceJson)
      .map((turn) => {
        const stance = JSON.parse(turn.stanceJson as string) as Stance;
        const [school, name] = turn.expertName.split('·');
        return {
          expertName: name ?? turn.expertName,
          school: school ?? '',
          direction: stance.direction,
          confidence: stance.confidence,
          keyPoints: stance.keyPoints,
          contentDigest: (turn.content ?? '').replace(/\s+/g, ' ').slice(0, 160)
        };
      });
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
