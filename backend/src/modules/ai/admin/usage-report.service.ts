// 用量聚合报表服务：SQL 一次 group by（day/model/project/kind）+ service 内按生效价计价。
// 按天分组用 substr(created_at,1,10)：MySQL 与 sqlite 均支持且免依赖各库日期函数（先例 log-center.service.ts）。
// 口径：不按 status 过滤——失败记录 calls+1、tokens/unitCount 恒 0，金额自然为 0；
// byProject 仅统计有 projectId 的记录；modelId 为 null 的记录归「未知模型」桶。
// 金额输出显式 Number()：sqlite 聚合返回 number、MySQL 生产读 string（兜底先例 agents.service.ts:173）。
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiUsageLog } from '../../../common/entities/ai-usage-log.entity';
import { AiModelPrice } from '../../../common/entities/ai-model-price.entity';
import { AiModel } from '../../../common/entities/ai-model.entity';
import { NovelProject } from '../../../common/entities/novel-project.entity';
import { CHAT_KINDS, computeCost, parseEnvPrices, resolvePrice } from '../core/usage-cost.util';
import { UsageReportQueryDto } from './dto/usage-report.dto';

// 三维分组行（SQL 原始行，kind 为计价必需的第四维）。
interface PricedGroupRow {
  day: string;
  modelId: number | null;
  projectId: number | null;
  kind: string;
  calls: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  unitCount: number;
  cost: number | null;
  currency: string | null;
}

// 视图行聚合中间态：costItems 收集各分组行 (金额, 币种)，最后归约（币种唯一才有金额）。
interface AggItem {
  calls: number;
  tokens: number;
  unitCount: number;
  costItems: Array<{ cost: number; currency: string }>;
}

export interface UsageReportVo {
  summary: {
    calls: number;
    tokens: number;
    unitCount: number;
    // 按币种聚合的成本（仅计价覆盖的分组行）。
    costByCurrency: Record<string, number>;
    // 无价格行且无兜底价而无法计价的调用数（币种混合仅影响视图行金额显示，不计入）。
    uncoveredCalls: number;
  };
  byDay: Array<{ day: string; calls: number; tokens: number; unitCount: number; cost: number | null; currency: string | null }>;
  byModel: Array<{ modelId: number | null; modelName: string; calls: number; tokens: number; unitCount: number; cost: number | null; currency: string | null }>;
  byProject: Array<{ projectId: number; projectName: string; calls: number; tokens: number; unitCount: number; cost: number | null; currency: string | null }>;
}

@Injectable()
export class UsageReportService {
  constructor(
    @InjectRepository(AiUsageLog) private readonly usageRepo: Repository<AiUsageLog>,
    @InjectRepository(AiModelPrice) private readonly priceRepo: Repository<AiModelPrice>,
    @InjectRepository(AiModel) private readonly modelRepo: Repository<AiModel>,
    @InjectRepository(NovelProject) private readonly projectRepo: Repository<NovelProject>
  ) {}

  async report(query: UsageReportQueryDto): Promise<UsageReportVo> {
    const rows = await this.loadGroupRows(query);

    // 价格快照：窗口内涉及 kind 的价格行一次查回（modelId 匹配交给 resolvePrice）。
    // 查询前归一 kind：价目表只存 chat/image/video/tts，roundtable 日志须归 chat 才能命中已配价目行。
    const kinds = [...new Set(rows.map((row) => (CHAT_KINDS.has(row.kind) ? 'chat' : row.kind)))];
    const priceRows =
      kinds.length === 0 ? [] : await this.priceRepo.find({ where: { kind: In(kinds) } });
    const envDefaults = parseEnvPrices();

    const costByCurrency: Record<string, number> = {};
    let uncoveredCalls = 0;
    const priced: PricedGroupRow[] = rows.map((row) => {
      // 计价基准时间取当天末尾：当天发生的调用应匹配 ≤ 当天有效的最新价格行。
      // 不带 Z 后缀按本地时区解析：与 datetime 存储语义一致（sqlite/MySQL 均按服务器本地时区存取），
      // row.day 即 substr(created_at,1,10) 的本地日期；带 Z 会造成生效时间跨时区错位。
      const at = new Date(`${row.day}T23:59:59.999`);
      const price = resolvePrice(
        row.kind,
        at,
        priceRows,
        envDefaults,
        row.modelId ?? undefined
      );
      const cost = computeCost(
        row.kind,
        row.promptTokens,
        row.completionTokens,
        row.unitCount,
        price
      );
      const currency = price?.currency ?? null;
      if (cost != null && currency) {
        costByCurrency[currency] = Number((costByCurrency[currency] ?? 0) + cost);
      } else {
        uncoveredCalls += row.calls;
      }
      return { ...row, cost, currency };
    });

    // 三视图 rollup：分组行金额全非空且币种唯一才有行级金额（部分未覆盖时不显示金额，避免误导）。
    const byDayAgg = new Map<string, AggItem>();
    const byModelAgg = new Map<string, AggItem>();
    const byProjectAgg = new Map<string, AggItem>();
    for (const row of priced) {
      this.accumulate(byDayAgg, row.day, row);
      if (row.modelId != null) {
        this.accumulate(byModelAgg, String(row.modelId), row);
      } else {
        this.accumulate(byModelAgg, 'null', row);
      }
      if (row.projectId != null) {
        this.accumulate(byProjectAgg, String(row.projectId), row);
      }
    }

    const [models, projects] = await Promise.all([
      this.loadNames(this.modelRepo, [...byModelAgg.keys()].filter((key) => key !== 'null').map(Number)),
      this.loadNames(
        this.projectRepo,
        [...byProjectAgg.keys()].map(Number)
      )
    ]);

    const byDay = [...byDayAgg.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, agg]) => ({ day, ...this.finalize(agg) }));
    const byModel = [...byModelAgg.entries()]
      .map(([key, agg]) => {
        const modelId = key === 'null' ? null : Number(key);
        return {
          modelId,
          modelName: modelId == null ? '未知模型' : (models.get(modelId) ?? `模型#${modelId}`),
          ...this.finalize(agg)
        };
      })
      .sort((a, b) => b.calls - a.calls);
    const byProject = [...byProjectAgg.entries()]
      .map(([key, agg]) => {
        const projectId = Number(key);
        return {
          projectId,
          projectName: projects.get(projectId) ?? `项目#${projectId}`,
          ...this.finalize(agg)
        };
      })
      .sort((a, b) => a.projectId - b.projectId);

    const summary = priced.reduce(
      (acc, row) => ({
        calls: acc.calls + row.calls,
        tokens: acc.tokens + row.tokens,
        unitCount: acc.unitCount + row.unitCount
      }),
      { calls: 0, tokens: 0, unitCount: 0 }
    );

    return {
      summary: {
        ...summary,
        // 显式 Number()：金额输出恒 number（MySQL decimal 聚合读 string 的兜底）。
        costByCurrency: Object.fromEntries(
          Object.entries(costByCurrency).map(([currency, cost]) => [currency, Number(cost)])
        ),
        uncoveredCalls: Number(uncoveredCalls)
      },
      byDay,
      byModel,
      byProject
    };
  }

  /** 单查询三维（+kind 计价维）分组：count/sum 全聚合，不按 status 过滤（失败记录 calls 计入、金额为 0）。 */
  private async loadGroupRows(query: UsageReportQueryDto) {
    const qb = this.usageRepo
      .createQueryBuilder('log')
      .select('substr(log.created_at, 1, 10)', 'day')
      .addSelect('log.model_id', 'modelId')
      .addSelect('log.project_id', 'projectId')
      .addSelect('log.kind', 'kind')
      .addSelect('count(*)', 'calls')
      .addSelect('sum(log.total_tokens)', 'tokens')
      .addSelect('sum(log.prompt_tokens)', 'promptTokens')
      .addSelect('sum(log.completion_tokens)', 'completionTokens')
      .addSelect('sum(log.unit_count)', 'unitCount');
    if (query.from) {
      qb.andWhere('log.created_at >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('log.created_at <= :to', { to: new Date(query.to) });
    }
    if (query.modelId !== undefined) {
      qb.andWhere('log.model_id = :modelId', { modelId: query.modelId });
    }
    if (query.projectId !== undefined) {
      qb.andWhere('log.project_id = :projectId', { projectId: query.projectId });
    }
    if (query.kind) {
      qb.andWhere('log.kind = :kind', { kind: query.kind });
    }
    qb.groupBy('day')
      .addGroupBy('log.model_id')
      .addGroupBy('log.project_id')
      .addGroupBy('log.kind');
    const raw = await qb.getRawMany<{
      day: string;
      modelId: number | string | null;
      projectId: number | string | null;
      kind: string;
      calls: number | string;
      tokens: number | string | null;
      promptTokens: number | string | null;
      completionTokens: number | string | null;
      unitCount: number | string | null;
    }>();
    // 显式 Number()：sqlite 聚合恒 number，MySQL 生产读 string（先例 agents.service.ts:173）。
    return raw.map((row) => ({
      day: String(row.day),
      modelId: row.modelId == null ? null : Number(row.modelId),
      projectId: row.projectId == null ? null : Number(row.projectId),
      kind: row.kind,
      calls: Number(row.calls),
      tokens: Number(row.tokens ?? 0),
      promptTokens: Number(row.promptTokens ?? 0),
      completionTokens: Number(row.completionTokens ?? 0),
      unitCount: Number(row.unitCount ?? 0)
    }));
  }

  private accumulate(map: Map<string, AggItem>, key: string, row: PricedGroupRow): void {
    const agg = map.get(key) ?? { calls: 0, tokens: 0, unitCount: 0, costItems: [] };
    agg.calls += row.calls;
    agg.tokens += row.tokens;
    agg.unitCount += row.unitCount;
    if (row.cost != null && row.currency) {
      agg.costItems.push({ cost: row.cost, currency: row.currency });
    }
    map.set(key, agg);
  }

  /** 归约视图行：金额仅在币种唯一（或完全未覆盖）时输出。 */
  private finalize(agg: AggItem): {
    calls: number;
    tokens: number;
    unitCount: number;
    cost: number | null;
    currency: string | null;
  } {
    const currencies = [...new Set(agg.costItems.map((item) => item.currency))];
    const cost =
      currencies.length === 1
        ? Number(agg.costItems.reduce((sum, item) => sum + item.cost, 0))
        : null;
    return {
      calls: Number(agg.calls),
      tokens: Number(agg.tokens),
      unitCount: Number(agg.unitCount),
      cost,
      currency: currencies.length === 1 ? currencies[0] : null
    };
  }

  /** 批量 id→名称映射（窗口内涉及的模型/项目一次查回；行数小不做列裁剪）。 */
  private async loadNames<T extends { id: number }>(
    repo: Repository<T>,
    ids: number[]
  ): Promise<Map<number, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await repo.find({ where: { id: In(ids) } as never });
    return new Map(
      rows.map((row) => {
        const entity = row as { id: number; name?: string; displayName?: string };
        return [entity.id, entity.name ?? entity.displayName ?? `#${entity.id}`];
      })
    );
  }
}
