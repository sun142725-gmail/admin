// 任务流服务：流程 CRUD（含默认视频生产模板）+ 运行生命周期（启动/试运行/取消/断点重跑/查询）。
import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FlowDefinition, FlowDag } from '../../common/entities/flow-definition.entity';
import { FlowRun } from '../../common/entities/flow-run.entity';
import { FlowRunNode } from '../../common/entities/flow-run-node.entity';
import { DagValidationError, parseGraph } from './engine/dag.util';
import { FlowEngineService } from './engine/flow-engine.service';
import { CreateFlowDto, SingleRunDto, StartRunDto, UpdateFlowDto } from './dto/flow.dto';

// 新建流程的默认模板：主题 → 分镜脚本(JSON) → 首帧生图 → 图生视频 → 汇总输出。
const STARTER_DAG: FlowDag = {
  nodes: [
    {
      id: 'start',
      type: 'start',
      position: { x: 0, y: 220 },
      data: {
        name: '开始',
        config: {
          variables: [
            { name: 'topic', label: '视频主题', defaultValue: '一只橘猫的太空冒险，治愈系画风', required: 1 }
          ]
        }
      }
    },
    {
      id: 'storyboard',
      type: 'llm',
      position: { x: 320, y: 220 },
      data: {
        name: '分镜脚本',
        config: {
          systemPrompt:
            '你是短视频编导。只输出 JSON，不要输出任何其他文字。字段：storyboard(中文分镜脚本)、firstFramePrompt(首帧画面的英文提示词)、motionPrompt(图生视频的英文运动提示词)。',
          prompt:
            '主题：{{start.topic}}\n请规划一个 5 秒短视频：一段分镜脚本、首帧画面提示词、运动提示词。',
          outputFormat: 'json',
          temperature: 0.7
        }
      }
    },
    {
      id: 'firstFrame',
      type: 'image',
      position: { x: 640, y: 220 },
      data: { name: '生成首帧', config: { prompt: '{{storyboard.firstFramePrompt}}', size: '1280x720', count: 1 } }
    },
    {
      id: 'video',
      type: 'video',
      position: { x: 960, y: 220 },
      data: {
        name: '图生视频',
        config: { prompt: '{{storyboard.motionPrompt}}', firstFrame: '{{firstFrame.url}}', seconds: 5 }
      }
    },
    {
      id: 'end',
      type: 'end',
      position: { x: 1280, y: 220 },
      data: {
        name: '结束',
        config: {
          fields: [
            { key: 'video', value: '{{video.url}}' },
            { key: 'script', value: '{{storyboard.storyboard}}' }
          ]
        }
      }
    }
  ],
  edges: [
    { id: 'e-start-storyboard', source: 'start', target: 'storyboard' },
    { id: 'e-storyboard-frame', source: 'storyboard', target: 'firstFrame' },
    { id: 'e-frame-video', source: 'firstFrame', target: 'video' },
    { id: 'e-video-end', source: 'video', target: 'end' }
  ]
};

const TERMINAL_STATUSES = ['succeeded', 'failed', 'cancelled'];

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);

  constructor(
    @InjectRepository(FlowDefinition) private readonly flowRepo: Repository<FlowDefinition>,
    @InjectRepository(FlowRun) private readonly runRepo: Repository<FlowRun>,
    @InjectRepository(FlowRunNode) private readonly runNodeRepo: Repository<FlowRunNode>,
    private readonly engine: FlowEngineService
  ) {}

  // ---------- 流程定义 ----------

  /** 列表（轻量，不带 dag）+ 每个流程最近一次运行摘要。 */
  async list() {
    const flows = await this.flowRepo.find({ order: { sortOrder: 'DESC', id: 'DESC' } });
    if (flows.length === 0) {
      return [];
    }
    const latest = await this.runRepo
      .createQueryBuilder('run')
      .select('MAX(run.id)', 'id')
      .where('run.flowId IN (:...flowIds)', { flowIds: flows.map((flow) => flow.id) })
      .groupBy('run.flowId')
      .getRawMany<{ id: string }>();
    const latestIds = latest.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
    // 大 JSON 行（快照/产物）参与 filesort 会触发 Out of sort memory，只取列表所需列。
    const latestRuns = latestIds.length
      ? await this.runRepo.find({
          where: { id: In(latestIds) },
          select: ['id', 'flowId', 'status', 'mode', 'durationMs', 'finishedAt', 'createdAt']
        })
      : [];
    const runByFlow = new Map(latestRuns.map((run) => [run.flowId, run]));
    return flows.map((flow) => {
      const run = runByFlow.get(flow.id);
      return {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        icon: flow.icon,
        version: flow.version,
        status: flow.status,
        sortOrder: flow.sortOrder,
        nodeCount: flow.dag?.nodes?.length ?? 0,
        updatedAt: flow.updatedAt,
        createdAt: flow.createdAt,
        lastRun: run
          ? {
              id: run.id,
              status: run.status,
              mode: run.mode,
              durationMs: run.durationMs,
              finishedAt: run.finishedAt,
              createdAt: run.createdAt
            }
          : null
      };
    });
  }

  async detail(id: number) {
    const flow = await this.flowRepo.findOne({ where: { id } });
    if (!flow) {
      throw new NotFoundException('任务流不存在');
    }
    return flow;
  }

  async create(userId: number, dto: CreateFlowDto) {
    const flow = await this.flowRepo.save(
      this.flowRepo.create({
        name: dto.name,
        description: dto.description,
        icon: dto.icon ?? '🎬',
        dag: STARTER_DAG,
        createdBy: userId
      })
    );
    return this.detail(flow.id);
  }

  async update(id: number, dto: UpdateFlowDto) {
    const flow = await this.detail(id);
    if (dto.dag) {
      try {
        parseGraph(dto.dag);
      } catch (error) {
        throw new BadRequestException(error instanceof DagValidationError ? error.message : '画布结构非法');
      }
      if (JSON.stringify(dto.dag) !== JSON.stringify(flow.dag)) {
        flow.version += 1;
      }
    }
    Object.assign(flow, {
      name: dto.name ?? flow.name,
      description: dto.description ?? flow.description,
      icon: dto.icon ?? flow.icon,
      dag: dto.dag ? (dto.dag as unknown as FlowDag) : flow.dag,
      sortOrder: dto.sortOrder ?? flow.sortOrder,
      status: dto.status ?? flow.status
    });
    await this.flowRepo.save(flow);
    return this.detail(id);
  }

  async remove(id: number) {
    const flow = await this.detail(id);
    const runs = await this.runRepo.find({ where: { flowId: id }, select: ['id'] });
    if (runs.length > 0) {
      await this.runNodeRepo.delete({ runId: In(runs.map((run) => run.id)) });
      await this.runRepo.delete({ flowId: id });
    }
    await this.flowRepo.remove(flow);
    return { success: true };
  }

  async duplicate(id: number, userId: number) {
    const source = await this.detail(id);
    const copy = await this.flowRepo.save(
      this.flowRepo.create({
        name: `${source.name} 副本`,
        description: source.description,
        icon: source.icon,
        dag: source.dag,
        createdBy: userId
      })
    );
    return this.detail(copy.id);
  }

  // ---------- 运行 ----------

  /** 完整运行：校验画布 → 建 run（快照）→ 引擎异步推进。 */
  async startRun(userId: number, flowId: number, dto: StartRunDto) {
    const flow = await this.detail(flowId);
    if (flow.status !== 1) {
      throw new BadRequestException('任务流已停用');
    }
    try {
      parseGraph(flow.dag);
    } catch (error) {
      throw new BadRequestException(
        `画布校验失败：${error instanceof DagValidationError ? error.message : '结构非法'}`
      );
    }
    const run = await this.runRepo.save(
      this.runRepo.create({
        flowId,
        mode: 'run',
        flowVersion: flow.version,
        flowSnapshot: flow.dag,
        status: 'pending',
        inputs: dto.inputs ?? {},
        createdBy: userId
      })
    );
    void this.engine.execute(run.id);
    return { runId: run.id };
  }

  /** 单节点试运行：mock 上下文执行目标节点。 */
  async startSingle(userId: number, dto: SingleRunDto) {
    const flow = await this.detail(dto.flowId);
    try {
      parseGraph(flow.dag);
    } catch (error) {
      throw new BadRequestException(
        `画布校验失败：${error instanceof DagValidationError ? error.message : '结构非法'}`
      );
    }
    const node = flow.dag.nodes.find((item) => item.id === dto.nodeId);
    if (!node) {
      throw new BadRequestException('目标节点不存在，请保存画布后重试');
    }
    const run = await this.runRepo.save(
      this.runRepo.create({
        flowId: flow.id,
        mode: 'single',
        flowVersion: flow.version,
        flowSnapshot: flow.dag,
        status: 'pending',
        inputs: dto.mockContext ?? {},
        singleNodeId: dto.nodeId,
        createdBy: userId
      })
    );
    void this.engine.executeSingle(run.id);
    return { runId: run.id };
  }

  /** 断点重跑：沿用原运行的画布快照，已成功节点复用产物。 */
  async retryRun(userId: number, runId: number) {
    const source = await this.runRepo.findOne({ where: { id: runId } });
    if (!source) {
      throw new NotFoundException('原运行不存在');
    }
    const run = await this.runRepo.save(
      this.runRepo.create({
        flowId: source.flowId,
        mode: 'run',
        flowVersion: source.flowVersion,
        flowSnapshot: source.flowSnapshot,
        status: 'pending',
        inputs: source.inputs ?? {},
        retryOf: source.id,
        createdBy: userId
      })
    );
    void this.engine.execute(run.id);
    return { runId: run.id };
  }

  async cancelRun(runId: number) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('运行不存在');
    }
    if (TERMINAL_STATUSES.includes(run.status)) {
      return { success: true, status: run.status };
    }
    if (this.engine.isActive(runId)) {
      this.engine.requestCancel(runId);
      return { success: true, status: 'cancelling' };
    }
    // 引擎未推进（刚创建即取消/异常挂起）：直接落终态。
    await this.runNodeRepo
      .createQueryBuilder()
      .update(FlowRunNode)
      .set({ status: 'cancelled' })
      .where('runId = :runId AND status IN (:...statuses)', { runId, statuses: ['pending', 'running'] })
      .execute();
    run.status = 'cancelled';
    run.error = '用户取消';
    run.finishedAt = new Date();
    await this.runRepo.save(run);
    return { success: true, status: 'cancelled' };
  }

  /** 运行列表（联流程名，按时间倒序）。大列（快照/入参）不参与查询与排序。 */
  async runs(options: { flowId?: number; status?: string; take?: number }) {
    const qb = this.runRepo
      .createQueryBuilder('run')
      .select([
        'run.id',
        'run.flowId',
        'run.mode',
        'run.status',
        'run.durationMs',
        'run.retryOf',
        'run.singleNodeId',
        'run.error',
        'run.startedAt',
        'run.finishedAt',
        'run.createdAt'
      ])
      .orderBy('run.id', 'DESC')
      .take(Math.min(options.take ?? 50, 200));
    if (options.flowId) {
      qb.andWhere('run.flowId = :flowId', { flowId: options.flowId });
    }
    if (options.status) {
      qb.andWhere('run.status = :status', { status: options.status });
    }
    const runs = await qb.getMany();
    if (runs.length === 0) {
      return [];
    }
    const flows = await this.flowRepo.find({
      where: { id: In(runs.map((run) => run.flowId)) },
      select: ['id', 'name', 'icon']
    });
    const flowById = new Map(flows.map((flow) => [flow.id, flow]));
    return runs.map((run) => ({
      id: run.id,
      flowId: run.flowId,
      flowName: flowById.get(run.flowId)?.name ?? `#${run.flowId}`,
      flowIcon: flowById.get(run.flowId)?.icon,
      mode: run.mode,
      status: run.status,
      durationMs: run.durationMs,
      retryOf: run.retryOf,
      singleNodeId: run.singleNodeId,
      error: run.error,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt
    }));
  }

  /** 运行详情（含节点执行记录，调试面板数据源）。节点排序在应用层完成，避免大 JSON 行 filesort。 */
  async runDetail(runId: number) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('运行不存在');
    }
    const nodes = await this.runNodeRepo.find({ where: { runId } });
    nodes.sort((a, b) => a.id - b.id);
    return { run, nodes };
  }

  /** 某流程最近一次成功运行各节点产物（编辑器试运行的 mock 预填）。 */
  async latestOutputs(flowId: number) {
    const run = await this.runRepo.findOne({
      where: { flowId, mode: 'run', status: 'succeeded' },
      order: { id: 'DESC' }
    });
    if (!run) {
      return { runId: null as number | null, context: {} as Record<string, Record<string, unknown>> };
    }
    const nodes = await this.runNodeRepo.find({ where: { runId: run.id } });
    const context: Record<string, Record<string, unknown>> = {};
    for (const node of nodes) {
      if (node.output) {
        context[node.nodeId] = node.output;
      }
    }
    return { runId: run.id, context };
  }
}
