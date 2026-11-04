// 策略配置服务（方案 §2/§4/§5/§6/§7）：管理端 CRUD + 策略回测端点 + 模拟盘重放投影核心
// + 圆桌简报 + 自选股联动标签。校验失败抛 BadRequestException（全局过滤器映射 422）。
// 查询全部用 find/In()/upsert repos API（§12① QueryBuilder 实体属性名坑：方案查询不做 QB）。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { StockDailyBar } from '../../../common/entities/stock-daily-bar.entity';
import { StockStrategyConfig } from '../../../common/entities/stock-strategy-config.entity';
import { StockStrategySignal } from '../../../common/entities/stock-strategy-signal.entity';
import { StockStrategyPosition } from '../../../common/entities/stock-strategy-position.entity';
import { StockStrategyAccount } from '../../../common/entities/stock-strategy-account.entity';
import { isoDay, toUtcMidnight } from '../daily-bars/daily-bars-calib.util';
import { DEFAULT_CONFIG } from '../backtest/backtest-match.util';
import { DEFAULT_COST } from '../backtest/backtest-cost.util';
import { runBacktest } from '../backtest/backtest-match.util';
import {
  PositionModelParams,
  resolvePositionModel
} from '../backtest/backtest-sizing.util';
import { Bar, BacktestConfig, BacktestMetrics } from '../backtest/backtest.types';
import {
  defaultPositionModelFor,
  getStrategyDefinition
} from './strategy-templates.util';
import { runPortfolioBacktest, PortfolioTradeRecord } from './strategy-portfolio-match.util';
import { foldProjection } from './strategy-state-machine.util';
import {
  ROTATION_PAIRING_DECLARATION,
  SIM_DECLARATION_LINES,
  renderStrategyBriefText
} from './strategy-brief.util';
import {
  CreateStrategyDto,
  StrategyBacktestDto,
  UpdateStrategyDto
} from './dto/strategy-config.dto';

/** 单标的/基准日历最小 bar 数（<2 无法构成任何 T→T+1 成交路径，照 BacktestService.MIN_BARS）。 */
const MIN_BARS = 2;

/** 重放预热根数（env STOCK_STRATEGY_WARMUP_BARS，默认 250，与日线库首抓 STOCK_BARS_INIT_BARS 对齐）。 */
const WARMUP_BARS = () => {
  const value = Number(process.env.STOCK_STRATEGY_WARMUP_BARS ?? 250);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 250;
};

/** 预热+正式总窗口根数上限（env STOCK_STRATEGY_MAX_BARS，默认 2000；超限=该策略本轮 failed，禁滑动截断）。 */
const MAX_BARS = () => {
  const value = Number(process.env.STOCK_STRATEGY_MAX_BARS ?? 2000);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2000;
};

/** 重放窗口超上限错误：由 accounts.last_run_* 承载（非 422），携带已落库的 failed 账户行。 */
export class ReplayWindowExceededError extends Error {
  constructor(
    message: string,
    readonly account: AccountDto
  ) {
    super(message);
  }
}

export interface AccountDto {
  cash: number;
  equity: number;
  marketValue: number;
  replayedThrough: string | null;
  lastRunDate: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
}

export interface RunResult {
  signalsUpserted: number;
  positionsUpdated: number;
  account: AccountDto;
  replayedThrough: string | null;
  /** 重入锁命中被跳过时为 true（返回当前账户快照）。 */
  skipped?: boolean;
}

/** 列表/详情条目（API 契约 §7 第 2/3 条）。 */
export interface ConfigDto {
  id: number;
  name: string;
  template: string;
  enabled: boolean;
  symbols: string[];
  params: Record<string, unknown>;
  initialCash: number;
  positionModel: Record<string, unknown> | null;
  simStartDate: string;
  remark: string | null;
  createdAt?: Date;
}

const isDuplicateKeyError = (error: unknown): boolean => {
  const code = (error as { code?: string; driverError?: { code?: string } }) ?? {};
  if (code.code === 'ER_DUP_ENTRY' || code.driverError?.code === 'ER_DUP_ENTRY') {
    return true;
  }
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
};

@Injectable()
export class StrategyService {
  /** 进程内 per-strategy running 锁（§4 幂等三层③）：防手动/定时重入。 */
  private readonly running = new Set<number>();

  constructor(
    @InjectRepository(StockStrategyConfig)
    private readonly configRepo: Repository<StockStrategyConfig>,
    @InjectRepository(StockStrategySignal)
    private readonly signalRepo: Repository<StockStrategySignal>,
    @InjectRepository(StockStrategyPosition)
    private readonly positionRepo: Repository<StockStrategyPosition>,
    @InjectRepository(StockStrategyAccount)
    private readonly accountRepo: Repository<StockStrategyAccount>,
    @InjectRepository(StockDailyBar)
    private readonly barRepo: Repository<StockDailyBar>
  ) {}

  // ---------- 模板/参数/标的校验（create/update 共用） ----------

  /** 模板定义 + 参数合并（defaultParams 兜底）+ 模板 validateParams 校验；非法 → 422。 */
  private resolveTemplateParams(
    template: string,
    paramsRaw: Record<string, unknown> | null | undefined
  ) {
    const def = getStrategyDefinition(template);
    if (!def) {
      throw new BadRequestException(
        `非法模板 ${template}（合法值：ma-cross/macd/donchian/etf-momentum）`
      );
    }
    const params: Record<string, unknown> = { ...def.defaultParams, ...(paramsRaw ?? {}) };
    const errors = def.validateParams(params);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }
    return { def, params };
  }

  /** 标的池校验：去重；单标的模板恰 1、轮动 ≥2 且 ≤8；空 → 422。 */
  private resolveSymbols(template: string, singleSymbol: boolean, symbolsRaw: string[] | null | undefined): string[] {
    const symbols = [...new Set((symbolsRaw ?? []).map((symbol) => symbol.trim()).filter(Boolean))];
    if (symbols.length === 0) {
      throw new BadRequestException('请提供标的代码 symbols');
    }
    if (singleSymbol && symbols.length !== 1) {
      throw new BadRequestException('单标的模板的标的池必须恰为 1 个代码');
    }
    if (!singleSymbol && symbols.length < 2) {
      throw new BadRequestException('轮动模板的标的池至少需要 2 个代码');
    }
    if (symbols.length > 8) {
      throw new BadRequestException('标的池最多 8 个代码');
    }
    return symbols;
  }

  /** 正式段起点校验（真实日历日期，toUtcMidnight 拒绝越界日期）；缺省=当年 1 月 1 日。 */
  private resolveSimStartDate(raw: string | null | undefined): string {
    const value = raw ?? `${new Date().getUTCFullYear()}-01-01`;
    if (!toUtcMidnight(value)) {
      throw new BadRequestException('simStartDate 必须为真实日历日期（YYYY-MM-DD）');
    }
    return value;
  }

  // ---------- CRUD ----------

  async create(dto: CreateStrategyDto, userId?: number): Promise<{ id: number }> {
    const { def, params } = this.resolveTemplateParams(dto.template, dto.params);
    const symbols = this.resolveSymbols(def.template, def.singleSymbol, dto.symbols);
    const simStartDate = this.resolveSimStartDate(dto.simStartDate);

    const existing = await this.configRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException('策略名已存在');
    }
    try {
      const created = await this.configRepo.save(
        this.configRepo.create({
          name: dto.name,
          template: def.template,
          params,
          symbols,
          initialCash: dto.initialCash ?? 100000,
          positionModel: (dto.positionModel as Record<string, unknown> | undefined) ?? null,
          enabled: true,
          simStartDate,
          remark: dto.remark ?? null,
          createdBy: userId ?? null
        })
      );
      return { id: created.id };
    } catch (error) {
      // 并发创建同名：唯一键 uk_stock_strategy_configs_name 兜底，恰一胜一败
      if (isDuplicateKeyError(error)) {
        throw new BadRequestException('策略名已存在');
      }
      throw error;
    }
  }

  async list(query: {
    page?: number;
    pageSize?: number;
    template?: string;
    enabled?: string;
  }): Promise<{
    items: Array<ConfigDto & { account: AccountDto | null; latestSignalCount: number }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, Math.floor(Number(query.page ?? 1)) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize ?? 20)) || 20));
    const where: Record<string, unknown> = {};
    if (query.template) {
      where.template = query.template;
    }
    if (query.enabled === 'true' || query.enabled === 'false') {
      where.enabled = query.enabled === 'true';
    }
    const [rows, total] = await this.configRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    const ids = rows.map((row) => row.id);
    const accounts = ids.length
      ? await this.accountRepo.find({ where: { strategyId: In(ids) } })
      : [];
    const accountByStrategy = new Map(accounts.map((account) => [account.strategyId, account]));
    // 信号计数：逐策略索引 count 小查询（§12① 方案查询全走 repos API，不用 QB 字符串列名）
    const countByStrategy = new Map<number, number>();
    for (const id of ids) {
      countByStrategy.set(id, await this.signalRepo.count({ where: { strategyId: id } }));
    }

    const items = rows.map((row) => {
      const account = accountByStrategy.get(row.id);
      return {
        ...this.toConfigDto(row),
        account: account ? this.toAccountDto(account) : null,
        latestSignalCount: countByStrategy.get(row.id) ?? 0
      };
    });
    return { items, total, page, pageSize };
  }

  async getDetail(id: number): Promise<{
    config: ConfigDto;
    account: AccountDto | null;
    positions: Array<{
      symbol: string;
      status: string;
      shares: number;
      avgCost: number | null;
      lastBuyDate: string | null;
      lastMarkDate: string | null;
      lastPrice: number | null;
      marketValue: number | null;
      unrealizedPnl: number | null;
    }>;
    recentSignals: Array<{
      tradeDate: string;
      symbol: string;
      action: string;
      status: string;
      skipReason: string | null;
      filledPrice: number | null;
      shares: number;
      fee: number | null;
    }>;
  }> {
    const config = await this.loadConfig(id);
    const [account, positions, signals] = await Promise.all([
      this.accountRepo.findOne({ where: { strategyId: id } }),
      this.positionRepo.find({ where: { strategyId: id }, order: { symbol: 'ASC' } }),
      this.signalRepo.find({ where: { strategyId: id }, order: { tradeDate: 'DESC', id: 'DESC' }, take: 20 })
    ]);
    return {
      config: this.toConfigDto(config),
      account: account ? this.toAccountDto(account) : null,
      positions: positions.map((position) => ({
        symbol: position.symbol,
        status: position.status,
        shares: position.shares,
        avgCost: position.avgCost == null ? null : Number(position.avgCost),
        lastBuyDate: position.lastBuyDate ? isoDay(position.lastBuyDate) : null,
        lastMarkDate: position.lastMarkDate ? isoDay(position.lastMarkDate) : null,
        lastPrice: position.lastPrice == null ? null : Number(position.lastPrice),
        marketValue: position.marketValue == null ? null : Number(position.marketValue),
        unrealizedPnl: position.unrealizedPnl == null ? null : Number(position.unrealizedPnl)
      })),
      recentSignals: signals.map((signal) => ({
        tradeDate: isoDay(signal.tradeDate),
        symbol: signal.symbol,
        action: signal.action,
        status: signal.status,
        skipReason: signal.skipReason ?? null,
        filledPrice: signal.filledPrice == null ? null : Number(signal.filledPrice),
        shares: signal.shares,
        fee: signal.fee == null ? null : Number(signal.fee)
      }))
    };
  }

  async update(id: number, dto: UpdateStrategyDto): Promise<{ id: number; warning: string }> {
    const config = await this.loadConfig(id);

    // 生效模板/参数/标的：显式传入优先，否则沿用现值，组合后整体校验（避免半更新出非法组合）
    const template = dto.template ?? config.template;
    const paramsRaw = dto.params ?? config.params ?? undefined;
    const { def, params } = this.resolveTemplateParams(template, paramsRaw);
    const symbols = this.resolveSymbols(def.template, def.singleSymbol, dto.symbols ?? config.symbols ?? undefined);
    const simStartDate = this.resolveSimStartDate(dto.simStartDate ?? config.simStartDate);

    if (dto.name !== undefined && dto.name !== config.name) {
      const existing = await this.configRepo.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new BadRequestException('策略名已存在');
      }
    }

    config.name = dto.name ?? config.name;
    config.template = def.template;
    config.params = params;
    config.symbols = symbols;
    config.simStartDate = simStartDate;
    if (dto.initialCash !== undefined) {
      config.initialCash = dto.initialCash;
    }
    if (dto.positionModel !== undefined) {
      config.positionModel = (dto.positionModel as Record<string, unknown>) ?? null;
    }
    if (dto.remark !== undefined) {
      config.remark = dto.remark;
    }
    if (dto.enabled !== undefined) {
      config.enabled = dto.enabled;
    }
    await this.configRepo.save(config);
    // warning 为 UX 提示：投影残留已由「删全部投影+插新」根治，任意配置变更后下一轮全量重建（影子账户语义）
    return {
      id: config.id,
      warning: '配置已更新：下一轮调度将按新口径全量重建投影（影子账户语义，历史投影不做冻结）。'
    };
  }

  async remove(id: number): Promise<{ id: number }> {
    await this.loadConfig(id);
    await this.configRepo.manager.transaction(async (em) => {
      await em.delete(StockStrategySignal, { strategyId: id });
      await em.delete(StockStrategyPosition, { strategyId: id });
      await em.delete(StockStrategyAccount, { strategyId: id });
      await em.delete(StockStrategyConfig, { id });
    });
    return { id };
  }

  // ---------- 模拟盘重放（定时与手动共用核心） ----------

  /**
   * 单策略重放投影：固定锚窗口（锚点=max(库内最早 bar, sim_start_date 前推 WARMUP_BARS 个基准
   * 交易日)）→ 信号函数 → 组合撮合 → 状态机折叠 → 事务内「删该策略全部投影+按结果 upsert」。
   * 抛 BadRequestException（bars 不足等，手动入口 422）；窗口超 MAX_BARS → 落 failed 账户行后
   * 抛 ReplayWindowExceededError（调度路径吞掉继续下一策略；手动路径 200 返回 failed 账户）。
   */
  async replayOne(config: StockStrategyConfig): Promise<RunResult> {
    const { def, params } = this.resolveTemplateParams(config.template, config.params ?? undefined);
    const symbols = this.resolveSymbols(def.template, def.singleSymbol, config.symbols ?? undefined);
    const simStartDate = config.simStartDate;

    // 基准日历（轮动=symbols[0]，单标的=唯一标的）全量升序——锚点在其上回退 WARMUP_BARS 个交易日
    const baseBars = await this.loadBars(symbols[0], null);
    if (baseBars.length < MIN_BARS) {
      throw new BadRequestException(
        `库内可用日 K 不足（${baseBars.length} 根），模拟盘重放至少需要 ${MIN_BARS} 根`
      );
    }
    let lastIdxAtOrBefore = -1;
    // 窗口锚定与 computeBriefMetrics（圆桌简报「与模拟盘同一核心」口径）逐行同构——
    // 两处必须同步修改（差异仅 replayOne 多 MAX_BARS 检查，属有意保留），否则简报绩效与模拟盘投影静默分叉。
    for (let i = baseBars.length - 1; i >= 0; i -= 1) {
      if (baseBars[i].date <= simStartDate) {
        lastIdxAtOrBefore = i;
        break;
      }
    }
    // 固定锚不随重放日期滑动：锚点=max(库内最早 bar, sim_start_date 前推 WARMUP_BARS 个交易日)
    const anchorIdx =
      lastIdxAtOrBefore < 0 ? 0 : Math.max(0, lastIdxAtOrBefore - WARMUP_BARS());
    const windowBars = baseBars.length - anchorIdx;
    if (windowBars > MAX_BARS()) {
      // 禁滑动截断：本轮记 failed（错误消息提示调大上限或推迟 sim_start），投影保持上一轮
      const message = `重放窗口 ${windowBars} 根超过上限 ${MAX_BARS()}（STOCK_STRATEGY_MAX_BARS），请调大上限或推迟 sim_start_date`;
      const account = await this.recordRunFailure(config.id, message);
      throw new ReplayWindowExceededError(message, account);
    }
    const anchorDate = baseBars[anchorIdx].date;

    const barsBySymbol: Record<string, Bar[]> = {};
    barsBySymbol[symbols[0]] = baseBars.slice(anchorIdx);
    for (const symbol of symbols.slice(1)) {
      const bars = await this.loadBars(symbol, null);
      barsBySymbol[symbol] = bars.filter((bar) => bar.date >= anchorDate);
    }

    const signals = def.generateSignals({ barsBySymbol, params, simStartDate });

    // 模拟盘成本固定 DEFAULT_COST（回测端点才可覆盖）
    const backtestConfig: BacktestConfig = {
      initialCash: Number(config.initialCash) || 100000,
      limitUpPct: DEFAULT_CONFIG.limitUpPct,
      limitDownPct: DEFAULT_CONFIG.limitDownPct,
      limitEps: DEFAULT_CONFIG.limitEps,
      cost: { ...DEFAULT_COST }
    };
    const positionModelSource =
      (config.positionModel as PositionModelParams | null) ?? defaultPositionModelFor(def, params);
    const positionModel = resolvePositionModel(positionModelSource);
    const atrPeriod =
      positionModelSource.atrPeriod ?? (typeof params.atrPeriod === 'number' ? params.atrPeriod : 14);

    const result = runPortfolioBacktest({ barsBySymbol, signals, config: backtestConfig, positionModel, atrPeriod });

    // 盯市价：每 symbol 各自最近一根 bar（含 volume=0 停牌占位行；整行缺失的 symbol 无盯市）
    const marks: Record<string, { date: string; close: number } | null> = {};
    for (const symbol of symbols) {
      const bars = barsBySymbol[symbol];
      const last = bars.length > 0 ? bars[bars.length - 1] : null;
      marks[symbol] = last ? { date: last.date, close: last.close } : null;
    }
    const markDate = baseBars[baseBars.length - 1].date;

    // 全窗口经济折叠（预热段后果计入影子账户）+ 信号行 sim_start_date 落库过滤（§3 r4 钉死）
    const fold = foldProjection({
      signals,
      trades: result.trades,
      initialCash: backtestConfig.initialCash,
      simStartDate,
      marks,
      markDate
    });

    // 投影写入：事务内「删该策略全部投影（不带日期条件）→ 唯一键幂等 upsert」。
    // 理由：日期谓词在 sim_start_date 收窄时旧口径行残留混排；positions 键为 (strategy_id,symbol)，
    // 换池移出 symbol 时旧行同样残留；删全部+插新=任意配置变更后投影无残留、同日重跑恒等（§4）。
    const runDate = new Date();
    await this.configRepo.manager.transaction(async (em) => {
      await em.delete(StockStrategySignal, { strategyId: config.id });
      await em.delete(StockStrategyPosition, { strategyId: config.id });
      await em.delete(StockStrategyAccount, { strategyId: config.id });

      if (fold.signalRows.length > 0) {
        await em.upsert(
          StockStrategySignal,
          fold.signalRows.map((row) => ({
            strategyId: config.id,
            tradeDate: toUtcMidnight(row.tradeDate)!,
            symbol: row.symbol,
            action: row.action,
            status: row.status,
            skipReason: row.skipReason,
            filledPrice: row.filledPrice,
            shares: row.shares,
            fee: row.fee
          })),
          ['strategyId', 'tradeDate', 'symbol', 'action']
        );
      }
      if (fold.positionRows.length > 0) {
        await em.upsert(
          StockStrategyPosition,
          fold.positionRows.map((row) => ({
            strategyId: config.id,
            symbol: row.symbol,
            status: row.status,
            shares: row.shares,
            avgCost: row.avgCost,
            lastBuyDate: row.lastBuyDate ? toUtcMidnight(row.lastBuyDate) : null,
            lastMarkDate: row.lastMarkDate ? toUtcMidnight(row.lastMarkDate) : null,
            lastPrice: row.lastPrice,
            marketValue: row.marketValue,
            unrealizedPnl: row.unrealizedPnl
          })),
          ['strategyId', 'symbol']
        );
      }
      await em.upsert(
        StockStrategyAccount,
        {
          strategyId: config.id,
          cash: fold.account.cash,
          equity: fold.account.equity,
          marketValue: fold.account.marketValue,
          replayedThrough: fold.account.replayedThrough,
          lastRunDate: runDate,
          lastRunStatus: 'ok',
          lastRunError: null
        },
        ['strategyId']
      );
    });

    return {
      signalsUpserted: fold.signalRows.length,
      positionsUpdated: fold.positionRows.length,
      account: {
        cash: fold.account.cash,
        equity: fold.account.equity,
        marketValue: fold.account.marketValue,
        replayedThrough: fold.account.replayedThrough,
        lastRunDate: runDate.toISOString(),
        lastRunStatus: 'ok',
        lastRunError: null
      },
      replayedThrough: fold.account.replayedThrough
    };
  }

  /** 手动运行入口（POST /:id/run）：停用 422；bars 不足 422；窗口超限 200+failed 账户。 */
  async runManual(id: number): Promise<RunResult> {
    const config = await this.loadConfig(id);
    if (!config.enabled) {
      throw new BadRequestException('策略已停用，无法运行模拟盘');
    }
    try {
      return await this.runStrategy(config);
    } catch (error) {
      if (error instanceof ReplayWindowExceededError) {
        // 窗口超限已由 accounts.last_run_error 承载（§7 第 6 条），按 200 返回 failed 账户
        return {
          signalsUpserted: 0,
          positionsUpdated: 0,
          account: error.account,
          replayedThrough: error.account.replayedThrough
        };
      }
      throw error;
    }
  }

  /**
   * 运行入口（定时与手动共用核心，§4）：进程内 per-strategy running 锁防手动/定时重入——
   * 重入方跳过本轮（返回当前账户快照，skipped=true），幂等性由重放确定性+唯一键兜底。
   */
  async runStrategy(config: StockStrategyConfig): Promise<RunResult> {
    if (this.running.has(config.id)) {
      const account = await this.accountRepo.findOne({ where: { strategyId: config.id } });
      return {
        signalsUpserted: 0,
        positionsUpdated: 0,
        account: account ? this.toAccountDto(account) : this.emptyAccount(config.id),
        replayedThrough: account?.replayedThrough ?? null,
        skipped: true
      };
    }
    this.running.add(config.id);
    try {
      return await this.replayOne(config);
    } finally {
      this.running.delete(config.id);
    }
  }

  /** 调度路径：列出全部启用策略（id 升序串行重放）。 */
  async listEnabledConfigs(): Promise<StockStrategyConfig[]> {
    return this.configRepo.find({ where: { enabled: true }, order: { id: 'ASC' } });
  }

  /** 调度路径：按 id 取配置（指定策略手动补跑）。 */
  async getConfig(id: number): Promise<StockStrategyConfig | null> {
    return this.configRepo.findOne({ where: { id } });
  }

  /** 运行失败落账（调度错误隔离）：保留上一轮投影，仅写 last_run_*（错误隔离，继续下一策略）。 */
  async markRunFailed(strategyId: number, message: string): Promise<AccountDto> {
    return this.recordRunFailure(strategyId, message);
  }

  private emptyAccount(strategyId: number): AccountDto {
    void strategyId;
    return {
      cash: 0,
      equity: 0,
      marketValue: 0,
      replayedThrough: null,
      lastRunDate: null,
      lastRunStatus: null,
      lastRunError: null
    };
  }

  /** 运行失败落账（调度错误隔离/窗口超限共用）：保留上一轮投影，仅写 last_run_*。 */
  private async recordRunFailure(strategyId: number, message: string): Promise<AccountDto> {
    const runDate = new Date();
    const truncated = message.slice(0, 255);
    const existing = await this.accountRepo.findOne({ where: { strategyId } });
    let saved: StockStrategyAccount;
    if (existing) {
      existing.lastRunDate = runDate;
      existing.lastRunStatus = 'failed';
      existing.lastRunError = truncated;
      saved = await this.accountRepo.save(existing);
    } else {
      saved = await this.accountRepo.save(
        this.accountRepo.create({
          strategyId,
          cash: 0,
          equity: 0,
          marketValue: 0,
          replayedThrough: null,
          lastRunDate: runDate,
          lastRunStatus: 'failed',
          lastRunError: truncated
        })
      );
    }
    return this.toAccountDto(saved);
  }

  // ---------- 策略回测端点（§7 第 7 条） ----------

  /**
   * 单标的模板=内核 BacktestRunResult 原样（报告组件零改动）；轮动=PortfolioBacktestRunResult。
   * r4 注明：轮动调仓序数锚日=max(simStartDate, 本次窗口首日)，limit 截断（末 N 根语义）使窗口
   * 首日晚于 simStartDate 时相位与模拟盘可能不一致——回测为报告口径，撮合路径与模拟盘一致。
   */
  async backtest(
    id: number,
    dto: StrategyBacktestDto
  ): Promise<
    | {
        symbol: string;
        barsCount: number;
        firstDate: string | null;
        lastDate: string | null;
        equityCurve: unknown;
        trades: unknown;
        metrics: BacktestMetrics;
        config: BacktestConfig;
      }
    | {
        symbols: string[];
        barsCount: number;
        firstDate: string | null;
        lastDate: string | null;
        equityCurve: unknown;
        trades: unknown;
        metrics: BacktestMetrics;
        config: BacktestConfig;
      }
  > {
    const config = await this.loadConfig(id);
    const { def, params } = this.resolveTemplateParams(config.template, config.params ?? undefined);
    const symbols = this.resolveSymbols(def.template, def.singleSymbol, config.symbols ?? undefined);
    const limit = dto.limit ?? 500;

    // 回测端点仓位/成本：请求覆盖 > 配置 position_model > 模板默认；成本缺省 DEFAULT_COST
    const positionModelSource =
      dto.positionModel ??
      (config.positionModel as PositionModelParams | null) ??
      defaultPositionModelFor(def, params);
    const positionModel = resolvePositionModel(positionModelSource);
    const atrPeriod =
      positionModelSource.atrPeriod ?? (typeof params.atrPeriod === 'number' ? params.atrPeriod : 14);
    const backtestConfig: BacktestConfig = {
      initialCash: Number(config.initialCash) || 100000,
      limitUpPct: DEFAULT_CONFIG.limitUpPct,
      limitDownPct: DEFAULT_CONFIG.limitDownPct,
      limitEps: DEFAULT_CONFIG.limitEps,
      cost: {
        commissionRate: dto.cost?.commissionRate ?? DEFAULT_COST.commissionRate,
        minCommission: dto.cost?.minCommission ?? DEFAULT_COST.minCommission,
        stampTaxRate: dto.cost?.stampTaxRate ?? DEFAULT_COST.stampTaxRate,
        slippageRate: dto.cost?.slippageRate ?? DEFAULT_COST.slippageRate
      }
    };

    if (def.singleSymbol) {
      const symbol = symbols[0];
      const bars = await this.loadBars(symbol, limit);
      if (bars.length < MIN_BARS) {
        throw new BadRequestException(`库内可用日 K 不足（${bars.length} 根），回测至少需要 ${MIN_BARS} 根`);
      }
      // 单标的模板服务层喂 runBacktest 前剥离 symbol 映射回内核 Signal（§1.1）
      const signals = def
        .generateSignals({ barsBySymbol: { [symbol]: bars }, params, simStartDate: config.simStartDate })
        .map((signal) => ({ date: signal.date, action: signal.action }));
      const result = runBacktest({ bars, signals, config: backtestConfig, positionModel, atrPeriod });
      return {
        symbol,
        barsCount: bars.length,
        firstDate: bars[0]?.date ?? null,
        lastDate: bars[bars.length - 1]?.date ?? null,
        equityCurve: result.equityCurve,
        trades: result.trades,
        metrics: result.metrics,
        config: result.config
      };
    }

    const barsBySymbol: Record<string, Bar[]> = {};
    for (const symbol of symbols) {
      barsBySymbol[symbol] = await this.loadBars(symbol, limit);
    }
    const base = barsBySymbol[symbols[0]];
    if (base.length < MIN_BARS) {
      throw new BadRequestException(
        `库内可用日 K 不足（${base.length} 根），回测至少需要 ${MIN_BARS} 根`
      );
    }
    const signals = def.generateSignals({ barsBySymbol, params, simStartDate: config.simStartDate });
    const result = runPortfolioBacktest({ barsBySymbol, signals, config: backtestConfig, positionModel, atrPeriod });
    return {
      symbols,
      barsCount: base.length,
      firstDate: base[0]?.date ?? null,
      lastDate: base[base.length - 1]?.date ?? null,
      equityCurve: result.equityCurve,
      trades: result.trades,
      metrics: result.metrics,
      config: result.config
    };
  }

  // ---------- 圆桌简报（§5） ----------

  /**
   * 策略圆桌简报：现场重算一次重放绩效（纯本地毫秒级不触网）+ 当前信号摘要 + 持仓快照 + 账户。
   * briefJson={strategyId,configSnapshot,backtestMetrics,recentSignals,positions,account,declaration}——
   * 重启回放（roundtable.service.ts replayFromDb）天然兼容。
   */
  async buildRoundtableBrief(
    strategyId: number
  ): Promise<{ briefText: string; briefJson: Record<string, unknown> }> {
    const config = await this.loadConfig(strategyId);
    const { def, params } = this.resolveTemplateParams(config.template, config.params ?? undefined);
    const symbols = this.resolveSymbols(def.template, def.singleSymbol, config.symbols ?? undefined);

    // 现场重算（bars 不足/停牌等异常降级为 null 段落，会议照常进行）
    let metrics: BacktestMetrics | null = null;
    let barsRange: { firstDate: string | null; lastDate: string | null; barsCount: number } | null = null;
    let replayTrades: PortfolioTradeRecord[] | null = null;
    try {
      const replayed = await this.computeBriefMetrics(config, def.template, params, symbols);
      metrics = replayed.metrics;
      barsRange = replayed.barsRange;
      replayTrades = replayed.trades;
    } catch {
      metrics = null;
      barsRange = null;
    }

    const [signalRows, positionRows, account] = await Promise.all([
      this.signalRepo.find({
        where: { strategyId: config.id },
        order: { tradeDate: 'DESC', id: 'DESC' },
        take: 10
      }),
      this.positionRepo.find({ where: { strategyId: config.id }, order: { symbol: 'ASC' } }),
      this.accountRepo.findOne({ where: { strategyId: config.id } })
    ]);

    // recentSignals：模拟盘信号表优先（「当前信号摘要」的正文）；策略尚未跑过模拟盘时
    // 回落为回测重算的最近成交（简报仍可点评），来源显式落 briefJson.recentSignalsSource，
    // 文本段头部同步标注（strategy-brief.util 渲染），不冒充模拟盘实况。
    let recentSignals = signalRows.map((signal) => ({
      tradeDate: isoDay(signal.tradeDate),
      symbol: signal.symbol,
      action: signal.action,
      status: signal.status,
      skipReason: signal.skipReason ?? null
    }));
    let recentSignalsSource: 'sim' | 'backtest' = 'sim';
    if (recentSignals.length === 0 && replayTrades) {
      recentSignals = replayTrades
        .slice()
        .sort((a, b) => (b.tradeDate ?? b.signalDate).localeCompare(a.tradeDate ?? a.signalDate))
        .slice(0, 10)
        .map((trade) => ({
          tradeDate: trade.tradeDate ?? trade.signalDate,
          symbol: trade.symbol,
          action: trade.signalAction,
          status: trade.status,
          skipReason: trade.skipReason ?? null
        }));
      recentSignalsSource = 'backtest';
    }
    const positions = positionRows.map((position) => ({
      symbol: position.symbol,
      status: position.status,
      shares: position.shares,
      avgCost: position.avgCost == null ? null : Number(position.avgCost),
      lastPrice: position.lastPrice == null ? null : Number(position.lastPrice),
      marketValue: position.marketValue == null ? null : Number(position.marketValue),
      unrealizedPnl: position.unrealizedPnl == null ? null : Number(position.unrealizedPnl)
    }));
    const accountDto = account ? this.toAccountDto(account) : null;

    const briefText = renderStrategyBriefText({
      strategyName: config.name,
      templateLabel: def.label,
      params,
      symbols,
      simStartDate: config.simStartDate,
      enabled: config.enabled,
      metrics,
      barsRange,
      recentSignals,
      positions,
      account: accountDto,
      rotation: def.template === 'etf-momentum'
    });

    return {
      briefText,
      briefJson: {
        strategyId: config.id,
        configSnapshot: {
          name: config.name,
          template: def.template,
          templateLabel: def.label,
          params,
          symbols,
          initialCash: Number(config.initialCash) || 100000,
          positionModel: (config.positionModel as Record<string, unknown> | null) ?? null,
          simStartDate: config.simStartDate,
          enabled: config.enabled
        },
        backtestMetrics: metrics,
        barsRange,
        recentSignals,
        recentSignalsSource,
        positions,
        account: accountDto,
        declaration: {
          simulation: SIM_DECLARATION_LINES,
          rotationPairing: def.template === 'etf-momentum' ? ROTATION_PAIRING_DECLARATION : null
        }
      }
    };
  }

  /** 圆桌简报的重放绩效（与模拟盘同一核心：固定锚窗口→信号→组合撮合；异常向上抛由调用方降级）。 */
  private async computeBriefMetrics(
    config: StockStrategyConfig,
    template: string,
    params: Record<string, unknown>,
    symbols: string[]
  ): Promise<{
    metrics: BacktestMetrics;
    barsRange: { firstDate: string | null; lastDate: string | null; barsCount: number };
    trades: PortfolioTradeRecord[];
  }> {
    const def = getStrategyDefinition(template);
    if (!def) {
      throw new BadRequestException('非法模板');
    }
    const baseBars = await this.loadBars(symbols[0], null);
    if (baseBars.length < MIN_BARS) {
      throw new BadRequestException('库内可用日 K 不足');
    }
    let lastIdxAtOrBefore = -1;
    // 窗口锚定与 replayOne（模拟盘重放）逐行同构——两处必须同步修改（此处无 MAX_BARS 检查属有意省略），
    // 否则简报绩效与模拟盘投影静默分叉。
    for (let i = baseBars.length - 1; i >= 0; i -= 1) {
      if (baseBars[i].date <= config.simStartDate) {
        lastIdxAtOrBefore = i;
        break;
      }
    }
    const anchorIdx = lastIdxAtOrBefore < 0 ? 0 : Math.max(0, lastIdxAtOrBefore - WARMUP_BARS());
    const anchorDate = baseBars[anchorIdx].date;
    const barsBySymbol: Record<string, Bar[]> = {};
    barsBySymbol[symbols[0]] = baseBars.slice(anchorIdx);
    for (const symbol of symbols.slice(1)) {
      const bars = await this.loadBars(symbol, null);
      barsBySymbol[symbol] = bars.filter((bar) => bar.date >= anchorDate);
    }
    const signals = def.generateSignals({ barsBySymbol, params, simStartDate: config.simStartDate });
    const positionModelSource =
      (config.positionModel as PositionModelParams | null) ?? defaultPositionModelFor(def, params);
    const result = runPortfolioBacktest({
      barsBySymbol,
      signals,
      config: {
        initialCash: Number(config.initialCash) || 100000,
        limitUpPct: DEFAULT_CONFIG.limitUpPct,
        limitDownPct: DEFAULT_CONFIG.limitDownPct,
        limitEps: DEFAULT_CONFIG.limitEps,
        cost: { ...DEFAULT_COST }
      },
      positionModel: resolvePositionModel(positionModelSource),
      atrPeriod:
        positionModelSource.atrPeriod ?? (typeof params.atrPeriod === 'number' ? params.atrPeriod : 14)
    });
    return {
      metrics: result.metrics,
      barsRange: {
        firstDate: baseBars[anchorIdx]?.date ?? null,
        lastDate: baseBars[baseBars.length - 1]?.date ?? null,
        barsCount: baseBars.length - anchorIdx
      },
      trades: result.trades
    };
  }

  // ---------- 自选股联动（§6） ----------

  /**
   * 启用策略对请求标的的「近 5 交易日」信号标签：
   * - 交易日轴按日线库逐 symbol 推算（最近 5 个 bar 日，停牌缺日自然顺延）——不用信号表
   *   distinct trade_date 推算（信号表只有产生过信号的日期，节假日/停牌下不可靠）；
   * - 仅 status IN ('emitted','filled')——skipped（含 no_bar）不进 tag：永不成交的信号不当作
   *   BUY/SELL 展示；停用策略不返回。
   */
  async watchlistTags(symbolsRaw: string): Promise<{
    items: Array<{ symbol: string; date: string; action: string; strategyId: number; strategyName: string }>;
  }> {
    const symbols = [...new Set(symbolsRaw.split(',').map((symbol) => symbol.trim()).filter(Boolean))];
    if (symbols.length === 0) {
      throw new BadRequestException('请提供 symbols 查询参数');
    }
    if (symbols.length > 100) {
      throw new BadRequestException('symbols 最多 100 个代码');
    }
    // 近 5 交易日窗口：纯 repos API 逐 symbol 小查询（(symbol,trade_date) 索引，≤100 次，MVP 可接受）
    const windowLower = new Map<string, Date>();
    for (const symbol of symbols) {
      const rows = await this.barRepo.find({
        where: { symbol },
        order: { tradeDate: 'DESC' },
        take: 5,
        select: ['symbol', 'tradeDate']
      });
      if (rows.length === 0) {
        continue; // 库内无 bar：无窗口，不产标签
      }
      windowLower.set(symbol, rows[rows.length - 1].tradeDate);
    }

    const configs = await this.configRepo.find({ where: { enabled: true } });
    const items: Array<{
      symbol: string;
      date: string;
      action: string;
      strategyId: number;
      strategyName: string;
    }> = [];
    for (const config of configs) {
      for (const [symbol, lower] of windowLower) {
        const rows = await this.signalRepo.find({
          where: {
            strategyId: config.id,
            symbol,
            status: In(['emitted', 'filled']),
            tradeDate: MoreThanOrEqual(lower)
          },
          order: { tradeDate: 'DESC', id: 'DESC' },
          take: 10
        });
        for (const row of rows) {
          items.push({
            symbol: row.symbol,
            date: isoDay(row.tradeDate),
            action: row.action,
            strategyId: config.id,
            strategyName: config.name
          });
        }
      }
    }
    // 确定性排序：日期降序 → 代码升序 → 策略 id 升序
    items.sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol) || a.strategyId - b.strategyId
    );
    return { items };
  }

  // ---------- 内部工具 ----------

  private async loadConfig(id: number): Promise<StockStrategyConfig> {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException('策略不存在');
    }
    return config;
  }

  /** 读库取末 N 根（limit=null 取全量）并映射为内核 Bar（decimal 列返回 string，Number() 强转照先例）。 */
  private async loadBars(symbol: string, limit: number | null): Promise<Bar[]> {
    const rows = await this.barRepo.find({ where: { symbol }, order: { tradeDate: 'ASC' } });
    const sliced =
      limit == null ? rows : rows.slice(Math.max(0, rows.length - limit));
    return sliced.map((row) => ({
      date: isoDay(row.tradeDate),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      amount: Number(row.amount)
    }));
  }

  private toConfigDto(config: StockStrategyConfig): ConfigDto {
    return {
      id: config.id,
      name: config.name,
      template: config.template,
      enabled: config.enabled,
      symbols: config.symbols ?? [],
      params: config.params ?? {},
      initialCash: Number(config.initialCash) || 100000,
      positionModel: (config.positionModel as Record<string, unknown> | null) ?? null,
      simStartDate: config.simStartDate,
      remark: config.remark ?? null,
      createdAt: config.createdAt
    };
  }

  private toAccountDto(account: StockStrategyAccount): AccountDto {
    return {
      cash: Number(account.cash) || 0,
      equity: Number(account.equity) || 0,
      marketValue: Number(account.marketValue) || 0,
      replayedThrough: account.replayedThrough ?? null,
      lastRunDate: account.lastRunDate ? account.lastRunDate.toISOString() : null,
      lastRunStatus: account.lastRunStatus ?? null,
      lastRunError: account.lastRunError ?? null
    };
  }
}
