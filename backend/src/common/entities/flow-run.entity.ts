// 任务流运行实例：一次执行 = 一条记录；启动时对画布拍快照，保证历史可回溯。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { FlowDag } from './flow-definition.entity';

export type FlowRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

@Index(['flowId', 'id'])
@Index(['status', 'id'])
@Entity('flow_runs')
export class FlowRun extends BaseEntity {
  @Column({ name: 'flow_id' })
  flowId!: number;

  // run=完整执行；single=单节点试运行。
  @Column({ length: 16, default: 'run' })
  mode!: string;

  @Column({ name: 'flow_version', default: 1 })
  flowVersion!: number;

  // 启动时的画布快照（含节点配置）。
  @Column({ name: 'flow_snapshot', type: 'json' })
  flowSnapshot!: FlowDag;

  @Column({ length: 32, default: 'pending' })
  status!: string;

  // 开始节点入参 { 变量名: 值 }；single 模式存 mock 上下文。
  @Column({ type: 'json', nullable: true })
  inputs?: Record<string, unknown> | null;

  // 汇总产物（end 节点输出）。
  @Column({ type: 'json', nullable: true })
  outputs?: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date;

  @Column({ name: 'duration_ms', nullable: true })
  durationMs?: number;

  // 断点重跑：复用其已成功节点的产物。
  @Column({ name: 'retry_of', nullable: true })
  retryOf?: number;

  // single 模式：试运行的节点 ID。
  @Column({ name: 'single_node_id', length: 64, nullable: true })
  singleNodeId?: string;

  @Column({ name: 'created_by' })
  createdBy!: number;
}
