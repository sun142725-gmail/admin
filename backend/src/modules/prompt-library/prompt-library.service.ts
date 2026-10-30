// 提示词库服务：CRUD + 引用计数 + 批量同步（prompt_hash 幂等）+ 筛选统计。
// 模板正文由流水线（Go 侧）渲染，这里只管存储。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Repository } from 'typeorm';
import { PromptTemplate } from '../../common/entities/prompt-template.entity';
import {
  CreatePromptTemplateDto,
  QueryPromptLibraryDto,
  QueryPromptTemplateDto,
  SyncPromptTemplateItemDto,
  UpdatePromptTemplateDto
} from './dto/prompt-template.dto';
import { assertPublicHost, readBodyWithLimit } from './ssrf-guard.util';

// 示例图下载上限：5MB（流式读取超限即中止），防超大响应撑爆内存。
const EXAMPLE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * LIKE 关键字转义：把 \ % _ ! 视为字面量（! 同时是转义符，需先转义防悬挂）。
 * 转义符选 `!` 而非 MySQL 默认的 `\`：ESCAPE '!' 单字符字面量在 MySQL 与 sqlite 语义一致；
 * sqlite 字符串不做反斜杠转义，ESCAPE '\\' 是两字符串会直接报错（e2e 跑 sqlite :memory:）。
 * 导出为纯函数便于单测（AGENTS 规则 4）。
 */
export const escapeLike = (keyword: string): string => keyword.replace(/[\\%_!]/g, (ch) => `!${ch}`);

@Injectable()
export class PromptLibraryService {
  constructor(
    @InjectRepository(PromptTemplate)
    private readonly repo: Repository<PromptTemplate>
  ) {}

  // ---------- 幂等键 ----------

  /** 幂等键：sha256(trim(prompt))。MySQL TEXT 不能直接建唯一索引，故单独落 hash 列。 */
  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt.trim()).digest('hex');
  }

  // ---------- CRUD ----------

  async list(query: QueryPromptTemplateDto): Promise<PromptTemplate[]> {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.id', 'DESC');
    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }
    if (query.keyword) {
      const kw = `%${escapeLike(query.keyword)}%`;
      qb.andWhere("(t.name LIKE :kw ESCAPE '!' OR t.styleTags LIKE :kw ESCAPE '!')", { kw });
    }
    return qb.take(query.take ?? 50).getMany();
  }

  async detail(id: number): Promise<PromptTemplate> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`提示词模板 ${id} 不存在`);
    }
    return row;
  }

  async create(userId: number, dto: CreatePromptTemplateDto): Promise<PromptTemplate> {
    const promptHash = this.hashPrompt(dto.template);
    await this.assertHashFree(promptHash);
    try {
      const row = await this.repo.save(
        this.repo.create({ ...dto, promptHash, createdBy: userId, referenceCount: 0 })
      );
      return this.detail(row.id);
    } catch (error) {
      // 并发写入撞唯一索引：等价于已存在同正文模板。
      if (this.isUniqueViolation(error)) {
        throw new BadRequestException('已存在相同正文的提示词模板');
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdatePromptTemplateDto): Promise<PromptTemplate> {
    const existing = await this.detail(id);
    const patch: Partial<PromptTemplate> = { ...dto };
    if (typeof dto.template === 'string' && dto.template !== existing.template) {
      const promptHash = this.hashPrompt(dto.template);
      await this.assertHashFree(promptHash, id);
      patch.promptHash = promptHash;
    }
    try {
      await this.repo.update(id, patch);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new BadRequestException('已存在相同正文的提示词模板');
      }
      throw error;
    }
    return this.detail(id);
  }

  async remove(id: number): Promise<{ success: boolean }> {
    await this.detail(id);
    await this.repo.delete(id);
    return { success: true };
  }

  // 流水线引用模板时调用：引用计数 +1（失败不阻塞生成流程）。
  async recordUse(id: number): Promise<void> {
    await this.repo.increment({ id }, 'referenceCount', 1);
  }

  // ---------- 批量同步（幂等） ----------

  /**
   * 批量同步（幂等）：先并发按 hash 查重（命中计 skipped），再插入未命中的条目——
   * 跨请求并发的同 hash 插入由 prompt_hash 唯一索引兜底，冲突 catch 计 skipped。
   * 注意用 repo.insert（不包事务）：sqlite 单连接上并发 save 的事务交错会让
   * 失败语句的 ROLLBACK 连带回滚相邻已成功的 INSERT，insert 单语句无此问题。
   * 示例图 best-effort 下载落本地（失败保留原 URL），不阻塞同步结果。
   */
  async sync(
    userId: number,
    dto: { items: SyncPromptTemplateItemDto[] }
  ): Promise<{ received: number; inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    const downloaded: Array<{ id: number; localUrl: string }> = [];
    // 1) 并发查重：同一批内相同 prompt 只放行首条。
    const checked = await Promise.all(
      dto.items.map(async (item) => {
        const promptHash = this.hashPrompt(item.prompt);
        const exists = Boolean(
          await this.repo.findOne({ where: { promptHash }, select: ['id'] })
        );
        return { item, promptHash, exists };
      })
    );
    // 2) 逐条插入：唯一键冲突（跨请求并发）计 skipped。
    for (const { item, promptHash, exists } of checked) {
      if (exists) {
        skipped += 1;
        continue;
      }
      try {
        const result = await this.repo.insert(
          this.repo.create({
            name: (item.title ?? item.prompt.trim().slice(0, 20)).trim().slice(0, 128) || '未命名',
            category: (item.category ?? 'general').trim().slice(0, 64) || 'general',
            template: item.prompt.trim(),
            exampleImageUrl: item.imageUrl ?? null,
            source: item.sourceTool ?? null,
            sourceModel: item.sourceModel ?? null,
            sourceUrl: item.sourceUrl ?? null,
            promptHash,
            createdBy: userId,
            referenceCount: 0
          })
        );
        inserted += 1;
        const rowId = Number(result.identifiers[0]?.id);
        if (item.imageUrl && /^https?:\/\//.test(item.imageUrl)) {
          const localUrl = await this.downloadExampleImage(promptHash, item.imageUrl);
          if (localUrl && Number.isFinite(rowId)) {
            downloaded.push({ id: rowId, localUrl });
          }
        }
      } catch {
        // 并发唯一键冲突：另一请求已写入同 hash，计 skipped。
        skipped += 1;
      }
    }
    // 示图本地化在计数之后补写：失败保留外链（best-effort）。
    await Promise.all(downloaded.map(({ id, localUrl }) => this.repo.update(id, { exampleImageUrl: localUrl })));
    return { received: dto.items.length, inserted, skipped };
  }

  /**
   * http(s) 示例图下载落盘 uploads/prompt-library/{hash}.jpg；任何失败返回 null（保留原 URL）。
   * SSRF 防护：解析主机名并拒绝私网/环回/链路本地/保留 IP 段；响应须为 image/* 且不超过
   * EXAMPLE_IMAGE_MAX_BYTES（流式读取，超限中止）。失败 best-effort，不影响入库。
   */
  private async downloadExampleImage(promptHash: string, imageUrl: string): Promise<string | null> {
    try {
      const parsed = new URL(imageUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      await assertPublicHost(parsed.hostname);
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        return null;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        return null;
      }
      const buffer = await readBodyWithLimit(response.body, EXAMPLE_IMAGE_MAX_BYTES);
      if (!buffer || buffer.length === 0) {
        return null;
      }
      const relative = `prompt-library/${promptHash}.jpg`;
      const absolute = join(process.cwd(), 'uploads', relative);
      await mkdir(join(absolute, '..'), { recursive: true });
      await writeFile(absolute, buffer);
      return `/uploads/${relative}`;
    } catch {
      return null;
    }
  }

  // ---------- 筛选与统计 ----------

  /** 筛选分页（分类/来源工具/关键词），返回 { items,total,page,pageSize }。 */
  async search(query: QueryPromptLibraryDto): Promise<{
    items: PromptTemplate[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 100);
    const qb = this.repo.createQueryBuilder('t');
    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }
    if (query.sourceTool) {
      qb.andWhere('t.source = :sourceTool', { sourceTool: query.sourceTool });
    }
    if (query.keyword) {
      const kw = `%${escapeLike(query.keyword)}%`;
      qb.andWhere("(t.name LIKE :kw ESCAPE '!' OR t.template LIKE :kw ESCAPE '!')", { kw });
    }
    qb.orderBy('t.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /** 统计口径：总数 + 按分类分组计数。 */
  async stats(): Promise<{ total: number; byCategory: Array<{ category: string; count: number }> }> {
    const total = await this.repo.count();
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.category')
      .getRawMany<{ category: string; count: string }>();
    return {
      total,
      byCategory: rows.map((row) => ({ category: row.category, count: Number(row.count) }))
    };
  }

  // ---------- 内部 ----------

  private async assertHashFree(promptHash: string, exceptId?: number): Promise<void> {
    const existing = await this.repo.findOne({ where: { promptHash }, select: ['id'] });
    if (existing && existing.id !== exceptId) {
      throw new BadRequestException('已存在相同正文的提示词模板');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /UNIQUE constraint|ER_DUP_ENTRY|duplicate key/i.test(message);
  }
}
