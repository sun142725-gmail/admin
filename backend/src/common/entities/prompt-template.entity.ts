// 提示词模板实体：图文/动漫流水线按风格 key 引用的 prompt 库。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('prompt_templates')
@Index(['category'])
export class PromptTemplate extends BaseEntity {
  @Column({ length: 128, comment: '模板名称' })
  name!: string;

  // 风格 key（如 illustrated / poster / anime / ui），流水线按此引用。
  @Column({ length: 64, comment: '风格分类 key' })
  category!: string;

  @Column({ name: 'style_tags', type: 'varchar', length: 255, nullable: true, comment: '风格标签，逗号分隔' })
  styleTags!: string | null;

  // 支持 {{变量}} 占位（如 {{content}}），流水线渲染时替换。
  @Column({ type: 'text', comment: 'prompt 模板正文' })
  template!: string;

  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string | null;

  @Column({ name: 'example_image_url', type: 'varchar', length: 500, nullable: true, comment: '示例效果图' })
  exampleImageUrl!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '来源说明（复刻自/原创等）' })
  source!: string | null;

  @Column({ name: 'model_id', type: 'int', nullable: true, comment: '推荐模型 id（空则用能力路由）' })
  modelId!: number | null;

  @Column({ name: 'reference_count', type: 'int', default: 0, comment: '被流水线引用次数' })
  referenceCount!: number;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy!: number | null;
}
