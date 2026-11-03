// 合规检查链服务：敏感词库 CRUD（word 服务层 trim 后入库与查重）+ 发布前检查链（只读不落库，
// MVP 每次实时计算，无历史记录表）。词库量级数百，检查时全量载入启用词内存扫描。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ComplianceWord } from '../../common/entities/compliance-words.entity';
import {
  AIGC_UNDECLARED_MESSAGE,
  COMPLIANCE_CHECK_FIELDS,
  COMPLIANCE_VERDICT_RULE,
  ComplianceCheckField,
  ComplianceLevel,
  ScanWord
} from './compliance.types';
import { buildContextClip, computeVerdict, countByLevel, scanText } from './scan.util';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';
import { QueryWordsDto } from './dto/query-words.dto';
import { RunComplianceCheckDto } from './dto/run-check.dto';

// LIKE 关键字转义：只转义 ! % _（! 同时是转义符，需先转义防悬挂）。
// 转义符选 `!` 而非 MySQL 默认的 `\`：ESCAPE '!' 单字符字面量在 MySQL 与 sqlite 语义一致；
// sqlite 字符串不做反斜杠转义，ESCAPE '\\' 是两字符串会直接报错（照 prompt-library.service.ts:36-37 先例）。
// 语义为字面子串匹配：keyword 含 %/_ 时按字面命中而非通配全表。
const escapeLike = (keyword: string): string => keyword.replace(/[!%_]/g, (m) => `!${m}`);

@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(ComplianceWord)
    private readonly wordRepo: Repository<ComplianceWord>
  ) {}

  // 词库分页：QueryBuilder 条件全部用实体属性名（TypeORM 映射到列，写 DB 列名在 sqlite 下
  // 直接 no such column——照 publisher.service.ts:163 注释先例）
  async listWords(query: QueryWordsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.wordRepo.createQueryBuilder('word');
    if (query.level !== undefined) {
      qb.andWhere('word.level = :level', { level: query.level });
    }
    if (query.status !== undefined) {
      qb.andWhere('word.status = :status', { status: query.status });
    }
    if (query.keyword) {
      qb.andWhere("(word.word LIKE :kw ESCAPE '!')", { kw: `%${escapeLike(query.keyword)}%` });
    }
    qb.orderBy('word.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((item) => this.toWordVo(item)), total, page, pageSize };
  }

  async createWord(payload: CreateWordDto) {
    // trim 后非空把关：@Length(1,64) 校验的是 trim 前原文，纯空白 '   ' 会通过管道再被
    // service trim 成空串（word 唯一索引不拦空串首条，sqlite/mysql 同），必须在此拦下
    const word = payload.word.trim();
    if (!word) {
      throw new BadRequestException('敏感词不能为空白');
    }
    const entity = this.wordRepo.create({
      word,
      level: payload.level,
      status: payload.status ?? 1,
      suggestion: payload.suggestion ?? null,
      remark: payload.remark ?? null
    });
    try {
      const saved = await this.wordRepo.save(entity);
      return this.toWordVo(saved);
    } catch (error) {
      throw this.mapUniqueConflict(error, '该敏感词已存在');
    }
  }

  async updateWord(id: number, payload: UpdateWordDto) {
    const entity = await this.wordRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('敏感词不存在');
    }
    if (payload.word !== undefined) {
      // 同 createWord：trim 后非空把关，纯空白 word 不得改写存量行为空串
      const word = payload.word.trim();
      if (!word) {
        throw new BadRequestException('敏感词不能为空白');
      }
      entity.word = word;
    }
    if (payload.level !== undefined) {
      entity.level = payload.level;
    }
    if (payload.status !== undefined) {
      entity.status = payload.status;
    }
    if (payload.suggestion !== undefined) {
      entity.suggestion = payload.suggestion;
    }
    if (payload.remark !== undefined) {
      entity.remark = payload.remark;
    }
    try {
      const saved = await this.wordRepo.save(entity);
      return this.toWordVo(saved);
    } catch (error) {
      throw this.mapUniqueConflict(error, '该敏感词已存在');
    }
  }

  // 无引用约束（检查链不落库），直接删
  async removeWord(id: number) {
    const entity = await this.wordRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('敏感词不存在');
    }
    await this.wordRepo.delete({ id });
    return true;
  }

  // 发布前检查链：全量载入启用词（停用词不参与）→ 固定字段顺序逐段扫描 → AIGC 声明检查 →
  // 汇总结论。只读不写任何表；aigcDeclared=false 是业务结论（报告 blocked）不是 HTTP 错误。
  async runCheck(dto: RunComplianceCheckDto) {
    const words = await this.wordRepo.find({ where: { status: 1 } });
    const scanWords: ScanWord[] = words.map((item) => ({
      word: item.word,
      level: item.level as ComplianceLevel
    }));
    const suggestionByWord = new Map(words.map((item) => [item.word, item.suggestion ?? null]));

    const checkedFields: string[] = [];
    const sensitiveHits: Array<{
      field: ComplianceCheckField;
      word: string;
      level: ComplianceLevel;
      start: number;
      end: number;
      context: string;
      suggestion: string | null;
    }> = [];
    for (const field of COMPLIANCE_CHECK_FIELDS) {
      const value = dto[field];
      if (typeof value !== 'string' || value.length === 0) {
        continue;
      }
      checkedFields.push(field);
      for (const hit of scanText(value, scanWords)) {
        sensitiveHits.push({
          field,
          word: hit.word,
          level: hit.level,
          start: hit.start,
          end: hit.end,
          context: buildContextClip(value, hit.start, hit.end),
          // suggestion 仅 replace 级且库词配置了建议词时非空
          suggestion: hit.level === 'replace' ? suggestionByWord.get(hit.word) ?? null : null
        });
      }
    }

    return {
      verdict: computeVerdict(sensitiveHits, dto.aigcDeclared),
      verdictRule: COMPLIANCE_VERDICT_RULE,
      checkedFields,
      aigcCheck: {
        declared: dto.aigcDeclared,
        verdict: dto.aigcDeclared ? 'pass' : 'blocked',
        message: dto.aigcDeclared ? '' : AIGC_UNDECLARED_MESSAGE
      },
      sensitiveHits,
      summary: countByLevel(sensitiveHits)
    };
  }

  // VO 白名单：词库无密文类敏感列，但仍统一出口便于后续加列不外泄
  private toWordVo(entity: ComplianceWord) {
    return {
      id: entity.id,
      word: entity.word,
      level: entity.level,
      status: entity.status,
      suggestion: entity.suggestion ?? null,
      remark: entity.remark ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  // 唯一索引冲突转客户端错误：顺序重复与 Promise.all 并发两条路径都被该 catch 兜住
  // （sqlite 报 UNIQUE constraint failed，mysql 报 Duplicate entry / ER_DUP_ENTRY，宽匹配跨库兼容）。
  // Nest 语义 400 经全局异常过滤器统一映射为 422（http-exception.filter.ts 项目约定）。
  private mapUniqueConflict(error: unknown, message: string): unknown {
    const text = error instanceof Error ? error.message : String(error);
    if (error instanceof QueryFailedError && /UNIQUE|Duplicate|ER_DUP_ENTRY/i.test(text)) {
      return new BadRequestException(message);
    }
    return error;
  }
}
