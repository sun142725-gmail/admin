// 提示词库服务：CRUD + 引用计数。模板正文由流水线（Go 侧）渲染，这里只管存储。
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptTemplate } from '../../common/entities/prompt-template.entity';
import {
  CreatePromptTemplateDto,
  QueryPromptTemplateDto,
  UpdatePromptTemplateDto
} from './dto/prompt-template.dto';

@Injectable()
export class PromptLibraryService {
  constructor(
    @InjectRepository(PromptTemplate)
    private readonly repo: Repository<PromptTemplate>
  ) {}

  async list(query: QueryPromptTemplateDto): Promise<PromptTemplate[]> {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.id', 'DESC');
    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }
    if (query.keyword) {
      qb.andWhere('(t.name LIKE :kw OR t.styleTags LIKE :kw)', { kw: `%${query.keyword}%` });
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
    const row = await this.repo.save(this.repo.create({ ...dto, createdBy: userId, referenceCount: 0 }));
    return this.detail(row.id);
  }

  async update(id: number, dto: UpdatePromptTemplateDto): Promise<PromptTemplate> {
    await this.detail(id);
    await this.repo.update(id, { ...dto });
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
}
