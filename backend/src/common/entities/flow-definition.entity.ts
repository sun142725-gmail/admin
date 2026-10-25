// 任务流定义：画布 DAG（React Flow 序列化结构）+ 版本号，运行时按快照执行，可继续编辑互不影响。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

// 画布图数据：与 React Flow 的导出结构一致（节点位置在 position，业务配置在 data）。
export interface FlowDag {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: { name?: string; config?: Record<string, unknown> };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

@Index(['status', 'sortOrder'])
@Entity('flow_definitions')
export class FlowDefinition extends BaseEntity {
  @Column({ length: 64 })
  name!: string;

  @Column({ length: 255, nullable: true })
  description?: string;

  // 列表卡片展示的 emoji 图标。
  @Column({ length: 16, nullable: true })
  icon?: string;

  // 画布图数据（FlowDag 结构）。
  @Column({ type: 'json' })
  dag!: FlowDag;

  // 每次保存结构变更 +1；运行记录回溯当时版本。
  @Column({ default: 1 })
  version!: number;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ default: 1 })
  status!: number;

  @Column({ name: 'created_by', nullable: true })
  createdBy?: number;
}
