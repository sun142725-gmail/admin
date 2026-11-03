// 合规敏感词库：发布前检查链的扫描词配置（block 禁用 / review 待审 / replace 提示）。
// 不建外键、无关联实体；level 不用 DB enum（MySQL enum 与 sqlite text 不兼容），
// 由 DTO IsIn(COMPLIANCE_LEVELS) 把关；word 服务层 trim 后入库与查重（唯一性以后端 trim 为准）。
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

// word 唯一：并发重复创建靠 DB 约束兜底，check-then-insert 存在竞态窗口
// （照 publisher-account.entity.ts:7 先例）
@Index(['word'], { unique: true })
@Entity('compliance_words')
export class ComplianceWord extends BaseEntity {
  // 敏感词原文（服务层 trim 后入库，DTO @Length(1,64) 设防——sqlite varchar 限长不生效）
  // 全列显式 type：联合类型否则 TypeORM 反射为 Object，sqlite 建表直接失败（AGENTS 双兼容条款）
  @Column({ type: 'varchar', length: 64 })
  word!: string;

  // 级别：'block' 禁用 / 'review' 待审 / 'replace' 提示（见 compliance.types）
  @Column({ type: 'varchar', length: 16 })
  level!: string;

  // 1 启用 / 0 停用（与 publisher_accounts.status 同构；停用词不参与扫描）
  @Column({ type: 'int', default: 1 })
  status!: number;

  // 替换建议词（replace 级提示用，其他级可空）
  @Column({ type: 'varchar', length: 64, nullable: true })
  suggestion?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark?: string | null;
}
