// 节点执行记录：一行 = 一次节点执行（输入输出、耗时、错误），调试面板数据源。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['runId', 'nodeId'])
@Entity('flow_run_nodes')
export class FlowRunNode extends BaseEntity {
  @Column({ name: 'run_id' })
  runId!: number;

  // 画布节点 ID（React Flow 节点 id）。
  @Column({ name: 'node_id', length: 64 })
  nodeId!: string;

  @Column({ name: 'node_type', length: 32 })
  nodeType!: string;

  @Column({ length: 128 })
  name!: string;

  // pending / running / succeeded / failed / skipped / reused。
  @Column({ length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'json', nullable: true })
  input?: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  output?: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date;

  @Column({ name: 'duration_ms', nullable: true })
  durationMs?: number;

  // AI 类节点命中的模型行，用于排障与用量对账。
  @Column({ name: 'model_id', nullable: true })
  modelId?: number;

  @Column({ name: 'total_tokens', nullable: true })
  totalTokens?: number;
}
