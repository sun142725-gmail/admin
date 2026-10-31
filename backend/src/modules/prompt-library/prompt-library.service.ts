// 提示词库服务：CRUD + 引用计数（删除保护）+ 批量同步（prompt_hash 幂等）+ 筛选统计。
// 模板正文由流水线（Go 侧）渲染，这里只管存储。
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { In, Repository } from 'typeorm';
import { PromptTemplate } from '../../common/entities/prompt-template.entity';
import {
  CreatePromptTemplateDto,
  QueryPromptLibraryDto,
  SyncPromptTemplateItemDto,
  UpdatePromptTemplateDto
} from './dto/prompt-template.dto';
import { assertPublicHost, readBodyWithLimit } from './ssrf-guard.util';

// 示例图下载上限：5MB（流式读取超限即中止），防超大响应撑爆内存。
const EXAMPLE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// sync 查重分块大小：200 条上限按 100/批做 IN 预查（≤2 次往返），取代逐条 SELECT。
const SYNC_DEDUP_CHUNK = 100;

// content-type → 示例图落盘扩展名映射：修此前一律 .jpg 硬编码（image/png 内容落 .jpg 语义错误）。
// 未收录的 image/* 兜底 .jpg（与历史落盘行为一致）。
const IMAGE_EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

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

  /**
   * 删除保护：已被流水线引用（referenceCount>0）且未带 force 时拒绝物理删（409，
   * 消息含引用次数与 force 提示）——防高引用模板被一键误删；force=true 才执行删除。
   */
  async remove(id: number, force = false): Promise<{ success: boolean }> {
    const row = await this.detail(id);
    if ((row.referenceCount ?? 0) > 0 && !force) {
      throw new ConflictException(
        `该模板已被流水线引用 ${row.referenceCount} 次，删除后相关流水线将回退默认风格；确认删除请带 force=true 重新提交`
      );
    }
    await this.repo.delete(id);
    return { success: true };
  }

  // 流水线引用模板时调用：引用计数 +1（失败不阻塞生成流程）。
  async recordUse(id: number): Promise<void> {
    await this.repo.increment({ id }, 'referenceCount', 1);
  }

  // ---------- 批量同步（幂等） ----------

  /**
   * 批量同步（幂等）：先按 hash 分块 IN 预查重（命中计 skipped），再插入未命中的条目——
   * 跨请求并发的同 hash 插入由 prompt_hash 唯一索引兜底，冲突 catch 计 skipped；
   * 同一批内的重复 prompt 首条入库、余条撞唯一索引计 skipped（语义与逐条查重一致）。
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
    // 1) hash 分块 IN 预查（SYNC_DEDUP_CHUNK/批）：取代逐条 SELECT（200 条 ≈400 次往返 → ≤2 次）。
    const hashes = dto.items.map((item) => this.hashPrompt(item.prompt));
    const existingHashes = new Set<string>();
    for (let start = 0; start < hashes.length; start += SYNC_DEDUP_CHUNK) {
      const chunk = [...new Set(hashes.slice(start, start + SYNC_DEDUP_CHUNK))];
      const rows = await this.repo.find({ where: { promptHash: In(chunk) }, select: ['promptHash'] });
      for (const row of rows) {
        if (row.promptHash) {
          existingHashes.add(row.promptHash);
        }
      }
    }
    // 同一批内相同 prompt 只放行首条：预查未命中的进入插入循环，批内重复由唯一索引兜底。
    const checked = dto.items.map((item, index) => ({
      item,
      promptHash: hashes[index],
      exists: existingHashes.has(hashes[index])
    }));
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
   * http(s) 示例图下载落盘 uploads/prompt-library/{hash}.{ext}（ext 按 content-type 映射，
   * 未收录的 image/* 兜底 .jpg）；任何失败返回 null（保留原 URL）。
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
      // content-type 可能带参数（如 image/png; charset=binary），取主类型做映射。
      const mimeType = contentType.split(';')[0].trim().toLowerCase();
      const ext = IMAGE_EXT_BY_CONTENT_TYPE[mimeType] ?? 'jpg';
      const relative = `prompt-library/${promptHash}.${ext}`;
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
      // 统一搜索口径：name + template + styleTags 三字段（修 audit issue8——
      // 旧双轨下 list 轨搜不到正文、search 轨搜不到标签）。
      const kw = `%${escapeLike(query.keyword)}%`;
      qb.andWhere(
        "(t.name LIKE :kw ESCAPE '!' OR t.template LIKE :kw ESCAPE '!' OR t.styleTags LIKE :kw ESCAPE '!')",
        { kw }
      );
    }
    qb.orderBy('t.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /**
   * 统计口径：总数 + 按分类分组计数 + 按来源分组计数（bySource facets）。
   * bySource 过滤空值来源（null/空串不构成可筛选项），供前端来源筛选下拉做完整选项
   * （修 audit issue4：选项不再随分页漂移）。
   */
  async stats(): Promise<{
    total: number;
    byCategory: Array<{ category: string; count: number }>;
    bySource: Array<{ source: string; count: number }>;
  }> {
    const total = await this.repo.count();
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('t.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.category')
      .getRawMany<{ category: string; count: string }>();
    const sourceRows = await this.repo
      .createQueryBuilder('t')
      .select('t.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.source')
      .getRawMany<{ source: string | null; count: string }>();
    return {
      total,
      byCategory: rows.map((row) => ({ category: row.category, count: Number(row.count) })),
      bySource: sourceRows
        .filter((row) => typeof row.source === 'string' && row.source.length > 0)
        .map((row) => ({ source: row.source as string, count: Number(row.count) }))
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
