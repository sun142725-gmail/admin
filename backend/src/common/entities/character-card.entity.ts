// 角色卡：小说转视频项目的角色一致性资料（外观描述 + 参考图）。
// 分镜出图时：外观描述并入首帧提示词（shot-prompt.util），参考图经限根校验转 data URL
// 注入图生图通道（openai-compatible images/edits），保证多镜头同一角色形象一致。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Index(['projectId'])
@Entity('character_cards')
export class CharacterCard extends BaseEntity {
  @Column({ name: 'project_id' })
  projectId!: number;

  @Column({ length: 64 })
  name!: string;

  // 外观描述（性别/年龄/发型/服饰/气质），出图时并入首帧提示词。
  @Column({ type: 'text', nullable: true })
  appearance?: string | null;

  // 参考图静态路径数组（files/upload 返回的 /uploads/<biz>/<file> 原样存储）。
  // 全仓 json 列均无 default（ai-model.entity.ts:51-52 default_params 先例；字面量 default
  // 在 MySQL 8.0.13 前受限），读取/注入侧统一 referenceImages ?? [] 归一。
  @Column({ name: 'reference_images', type: 'json', nullable: true })
  referenceImages?: string[] | null;

  // 主角色：注入分镜生图时排最前（isPrimary DESC 排序依据）。
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  // 同优先级下的展示/注入顺序。
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'created_by' })
  createdBy!: number;
}
