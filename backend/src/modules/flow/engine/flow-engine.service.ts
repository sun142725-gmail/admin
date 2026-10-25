// 执行引擎：解析快照 DAG → 建节点执行记录 → 按拓扑分层并行调度 → 节点/运行状态实时广播。
// 断点重跑：复用上次已成功节点的产物（reused），从失败节点继续；看门狗兜底服务重启导致的悬挂运行。
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { FlowRun } from '../../../common/entities/flow-run.entity';
import { FlowRunNode } from '../../../common/entities/flow-run-node.entity';
import { ModelRouterService } from '../../ai/core/model-router.service';
import { UsageLogService } from '../../ai/core/usage-log.service';
import { DagValidationError, ParsedGraph, parseGraph } from './dag.util';
import { NODE_HANDLERS, NodeHandlerDependencies } from './node-handlers';
import { RunEventsService } from './run-events.service';
import { VideoUpstreamService } from './video-upstream.service';

// 节点执行中抛出：终止本次运行（下游标记 skipped）。
class RunAbortedError extends Error {}

@Injectable()
export class FlowEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(FlowEngineService.name);
  // 发出取消请求的运行（层间/节点间检查，进行中的单节点等待其自然结束）。
  private readonly cancelRequests = new Set<number>();
  private readonly active = new Set<number>();

  private readonly deps: NodeHandlerDependencies;

  constructor(
    @InjectRepository(FlowRun) private readonly runRepo: Repository<FlowRun>,
    @InjectRepository(FlowRunNode) private readonly runNodeRepo: Repository<FlowRunNode>,
    router: ModelRouterService,
    usageLog: UsageLogService,
    video: VideoUpstreamService,
    private readonly events: RunEventsService
  ) {
    this.deps = { router, usageLog, video };
  }

  onModuleDestroy() {
    this.cancelRequests.clear();
    this.active.clear();
  }

  /** 请求取消：层间生效，运行内正在执行的单节点会等它结束后再收尾。 */
  requestCancel(runId: number): void {
    this.cancelRequests.add(runId);
  }

  /** 引擎是否正在推进该运行（false = 已落库但无人在跑，可直接改状态）。 */
  isActive(runId: number): boolean {
    return this.active.has(runId);
  }

  isCancelled(runId: number): boolean {
    return this.cancelRequests.has(runId);
  }

  /** 完整执行（fire-and-forget 调用，内部全量捕获异常落库）。 */
  async execute(runId: number): Promise<void> {
    if (this.active.has(runId)) {
      return;
    }
    this.active.add(runId);
    try {
      await this.executeInternal(runId);
    } catch (error) {
      this.logger.error(`运行 ${runId} 引擎异常: ${error instanceof Error ? error.message : String(error)}`);
      await this.finalize(runId, 'failed', error instanceof Error ? error.message : String(error));
    } finally {
      this.active.delete(runId);
      this.cancelRequests.delete(runId);
    }
  }

  private async executeInternal(runId: number): Promise<void> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run || run.status === 'cancelled') {
      return;
    }
    let graph: ParsedGraph;
    try {
      graph = parseGraph(run.flowSnapshot);
    } catch (error) {
      await this.finalize(runId, 'failed', error instanceof DagValidationError ? error.message : '画布结构非法');
      return;
    }

    run.status = 'running';
    run.startedAt = run.startedAt ?? new Date();
    await this.runRepo.save(run);
    this.events.publish({ type: 'run', runId, data: { status: 'running' } });

    // 节点记录初始化：断点重跑时复用上次已成功节点的产物。
    const rows = new Map<string, FlowRunNode>();
    const reusedOutputs: Record<string, Record<string, unknown>> = {};
    let previousNodes: FlowRunNode[] = [];
    if (run.retryOf) {
      previousNodes = await this.runNodeRepo.find({ where: { runId: run.retryOf } });
    }
    const previousByNodeId = new Map(previousNodes.map((node) => [node.nodeId, node]));
    for (const node of graph.nodes) {
      if (node.type === 'note') {
        continue;
      }
      const previous = previousByNodeId.get(node.id);
      const reusable =
        previous &&
        previous.status === 'succeeded' &&
        // 画布编辑过该节点（配置变化）则不复用：保守策略，比较配置 JSON。
        JSON.stringify(previous.input?.config ?? null) === JSON.stringify(node.config);
      if (reusable && previous?.output) {
        const row = await this.runNodeRepo.save(
          this.runNodeRepo.create({
            runId,
            nodeId: node.id,
            nodeType: node.type,
            name: node.name,
            status: 'reused',
            input: { config: node.config },
            output: previous.output,
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 0,
            modelId: previous.modelId
          })
        );
        rows.set(node.id, row);
        reusedOutputs[node.id] = previous.output;
        this.events.publish({
          type: 'node',
          runId,
          data: { nodeId: node.id, status: 'reused', name: node.name, nodeType: node.type }
        });
        continue;
      }
      const row = await this.runNodeRepo.save(
        this.runNodeRepo.create({
          runId,
          nodeId: node.id,
          nodeType: node.type,
          name: node.name,
          status: 'pending',
          input: { config: node.config }
        })
      );
      rows.set(node.id, row);
    }

    // 上下文 = 各节点输出；start 输出在调度到它时填充。
    const context: Record<string, Record<string, unknown>> = { ...reusedOutputs };
    const collectedOutputs: Record<string, unknown> = {};
    let failure: string | null = null;

    try {
      for (const level of graph.levels) {
        if (this.cancelRequests.has(runId)) {
          throw new RunAbortedError('已取消');
        }
        const pending = level.filter((node) => rows.get(node.id)?.status === 'pending');
        if (pending.length === 0) {
          continue;
        }
        await Promise.all(
          pending.map(async (node) => {
            const result = await this.execNode(run, node, context);
            context[node.id] = result.output;
            if (node.type === 'end') {
              Object.assign(collectedOutputs, result.output);
            }
          })
        );
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    if (this.cancelRequests.has(runId)) {
      await this.markRemaining(runId, 'cancelled');
      await this.finalize(runId, 'cancelled', '用户取消');
      return;
    }
    if (failure) {
      await this.markRemaining(runId, 'skipped');
      await this.finalize(runId, 'failed', failure);
      return;
    }
    if (Object.keys(collectedOutputs).length > 0) {
      // finalize 会重查运行行，产物先落库避免丢失。
      await this.runRepo.save(this.runRepo.create({ id: runId, outputs: collectedOutputs }));
    }
    await this.finalize(runId, 'succeeded');
  }

  /** 单节点试运行：mock 上下文执行目标节点，结果写入 run.outputs。 */
  async executeSingle(runId: number): Promise<void> {
    if (this.active.has(runId)) {
      return;
    }
    this.active.add(runId);
    try {
      const run = await this.runRepo.findOne({ where: { id: runId } });
      if (!run || !run.singleNodeId) {
        await this.finalize(runId, 'failed', '试运行参数缺失');
        return;
      }
      let graph: ParsedGraph;
      try {
        graph = parseGraph(run.flowSnapshot);
      } catch (error) {
        await this.finalize(runId, 'failed', error instanceof DagValidationError ? error.message : '画布结构非法');
        return;
      }
      const node = graph.nodeById.get(run.singleNodeId);
      if (!node || node.type === 'note' || !NODE_HANDLERS[node.type]) {
        await this.finalize(runId, 'failed', '目标节点不存在或不可执行');
        return;
      }

      run.status = 'running';
      run.startedAt = new Date();
      await this.runRepo.save(run);
      this.events.publish({ type: 'run', runId, data: { status: 'running' } });

      await this.runNodeRepo.save(
        this.runNodeRepo.create({
          runId,
          nodeId: node.id,
          nodeType: node.type,
          name: node.name,
          status: 'pending',
          input: { config: node.config, mockContext: run.inputs ?? {} }
        })
      );

      const mockContext = (run.inputs ?? {}) as Record<string, Record<string, unknown>>;
      try {
        const result = await this.execNode(run, node, mockContext, {
          // start 节点试运行：入参取自 mock 上下文的 start 槽位。
          singleInputs: node.type === 'start' ? (mockContext[node.id] ?? mockContext) : mockContext
        });
        await this.runRepo.save(this.runRepo.create({ id: runId, outputs: result.output }));
        await this.finalize(runId, 'succeeded');
      } catch (error) {
        await this.finalize(runId, 'failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.active.delete(runId);
    }
  }

  /** 执行单节点并落库 + 广播状态。 */
  private async execNode(
    run: FlowRun,
    node: ParsedGraph['nodes'][number],
    context: Record<string, Record<string, unknown>>,
    overrides?: { singleInputs?: Record<string, unknown> }
  ): Promise<{ output: Record<string, unknown>; modelId?: number }> {
    const row = await this.runNodeRepo.findOne({ where: { runId: run.id, nodeId: node.id } });
    if (row) {
      row.status = 'running';
      row.startedAt = new Date();
      await this.runNodeRepo.save(row);
    }
    this.events.publish({
      type: 'node',
      runId: run.id,
      data: { nodeId: node.id, status: 'running', name: node.name, nodeType: node.type }
    });

    const startedAt = Date.now();
    try {
      const handler = NODE_HANDLERS[node.type];
      const result = await handler({
        userId: run.createdBy,
        node,
        context,
        inputs: (overrides?.singleInputs ?? run.inputs ?? {}) as Record<string, unknown>,
        deps: this.deps
      });
      const durationMs = Date.now() - startedAt;
      if (row) {
        row.status = 'succeeded';
        row.output = result.output;
        row.finishedAt = new Date();
        row.durationMs = durationMs;
        row.modelId = result.modelId;
        await this.runNodeRepo.save(row);
      }
      this.events.publish({
        type: 'node',
        runId: run.id,
        data: {
          nodeId: node.id,
          status: 'succeeded',
          name: node.name,
          nodeType: node.type,
          durationMs,
          output: result.output
        }
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (row) {
        row.status = 'failed';
        row.error = message;
        row.finishedAt = new Date();
        row.durationMs = Date.now() - startedAt;
        await this.runNodeRepo.save(row);
      }
      this.events.publish({
        type: 'node',
        runId: run.id,
        data: { nodeId: node.id, status: 'failed', name: node.name, nodeType: node.type, error: message }
      });
      throw new RunAbortedError(`节点「${node.name}」执行失败: ${message}`);
    }
  }

  /** 把仍未执行的节点批量置为目标状态（按 DB 实时状态过滤，避免内存态过期）。 */
  private async markRemaining(runId: number, status: string): Promise<void> {
    await this.runNodeRepo
      .createQueryBuilder()
      .update(FlowRunNode)
      .set({ status })
      .where('runId = :runId AND status IN (:...statuses)', {
        runId,
        statuses: ['pending', 'running']
      })
      .execute();
  }

  private async finalize(runId: number, status: string, error?: string): Promise<void> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) {
      return;
    }
    run.status = status;
    run.error = error;
    run.finishedAt = new Date();
    run.durationMs = run.startedAt
      ? run.finishedAt.getTime() - new Date(run.startedAt).getTime()
      : undefined;
    await this.runRepo.save(run);
    this.events.publish({ type: 'run', runId, data: { status, error: error ?? null } });
  }

  // 看门狗：running 超过 30 分钟无更新（服务重启/进程被杀）→ 标记失败，避免悬挂。
  @Interval(60000)
  async watchdog() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const stuck = await this.runRepo
      .createQueryBuilder('run')
      .where('run.status = :status', { status: 'running' })
      .andWhere('run.updatedAt < :before', { before: new Date(Date.now() - 30 * 60 * 1000) })
      .getMany();
    for (const run of stuck) {
      if (this.active.has(run.id)) {
        continue; // 仍在正常执行（长视频节点）
      }
      this.logger.warn(`运行 ${run.id} 疑似中断（服务重启），标记失败`);
      await this.runNodeRepo
        .createQueryBuilder()
        .update(FlowRunNode)
        .set({ status: 'failed', error: '服务重启导致执行中断' })
        .where('runId = :runId AND status IN (:...statuses)', { runId: run.id, statuses: ['pending', 'running'] })
        .execute();
      await this.finalize(run.id, 'failed', '服务重启导致执行中断');
    }
  }
}
