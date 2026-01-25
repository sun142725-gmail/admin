// 字典服务负责字典与字典项的管理与查询。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dict } from '../../common/entities/dict.entity';
import { DictItem } from '../../common/entities/dict-item.entity';
import { BatchQueryDto } from './dto/batch-query.dto';
import { CreateDictDto } from './dto/create-dict.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { QueryDictDto } from './dto/query-dict.dto';
import { UpdateDictDto } from './dto/update-dict.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';
import { DictCacheService } from './dict-cache.service';

@Injectable()
export class DictService {
  constructor(
    @InjectRepository(Dict)
    private readonly dictRepo: Repository<Dict>,
    @InjectRepository(DictItem)
    private readonly dictItemRepo: Repository<DictItem>,
    private readonly dictCache: DictCacheService
  ) {}

  async list(query: QueryDictDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const qb = this.dictRepo.createQueryBuilder('dict');
    if (query.keyword) {
      qb.where('dict.code LIKE :keyword OR dict.name LIKE :keyword', {
        keyword: `%${query.keyword}%`
      });
    }
    if (query.status !== undefined) {
      if (query.keyword) {
        qb.andWhere('dict.status = :status', { status: query.status });
      } else {
        qb.where('dict.status = :status', { status: query.status });
      }
    }
    qb.orderBy('dict.created_at', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async detail(code: string) {
    const dict = await this.dictRepo.findOne({ where: { code } });
    if (!dict) {
      throw new NotFoundException('字典不存在');
    }
    const items = await this.dictItemRepo.find({
      where: { dictId: dict.id },
      order: { sortOrder: 'ASC', id: 'ASC' }
    });
    return { ...dict, items };
  }

  async batch(query: BatchQueryDto) {
    const codes = query.codes
      .split(',')
      .map((code) => code.trim())
      .filter((code) => code.length > 0);
    if (!codes.length) {
      throw new BadRequestException('codes 不能为空');
    }
    const result: Record<string, Array<Record<string, unknown>>> = {};
    for (const code of codes) {
      const cached = await this.dictCache.get(code);
      if (cached?.items) {
        result[code] = this.mapItemsByLang(
          cached.items as DictItem[],
          query.lang
        );
        continue;
      }
      const dict = await this.dictRepo.findOne({
        where: { code, status: 1 }
      });
      if (!dict) {
        result[code] = [];
        continue;
      }
      const items = await this.dictItemRepo.find({
        where: { dictId: dict.id, status: 1 },
        order: { sortOrder: 'ASC', id: 'ASC' }
      });
      result[code] = this.mapItemsByLang(items, query.lang);
      await this.dictCache.set(code, { code, items });
    }
    return result;
  }

  async create(payload: CreateDictDto) {
    const exists = await this.dictRepo.findOne({ where: { code: payload.code } });
    if (exists) {
      throw new BadRequestException('字典编码已存在');
    }
    const dict = this.dictRepo.create({
      code: payload.code,
      name: payload.name,
      description: payload.description,
      status: payload.status ?? 1
    });
    return this.dictRepo.save(dict);
  }

  async update(id: number, payload: UpdateDictDto) {
    const dict = await this.dictRepo.findOne({ where: { id } });
    if (!dict) {
      throw new NotFoundException('字典不存在');
    }
    Object.assign(dict, payload);
    const saved = await this.dictRepo.save(dict);
    await this.dictCache.del(dict.code);
    return saved;
  }

  async remove(id: number) {
    const dict = await this.dictRepo.findOne({ where: { id } });
    if (!dict) {
      throw new NotFoundException('字典不存在');
    }
    await this.dictRepo.delete({ id });
    await this.dictCache.del(dict.code);
    return true;
  }

  async createItem(dictId: number, payload: CreateDictItemDto) {
    const dict = await this.dictRepo.findOne({ where: { id: dictId } });
    if (!dict) {
      throw new NotFoundException('字典不存在');
    }
    const item = this.dictItemRepo.create({
      dictId,
      value: payload.value,
      label: payload.label,
      labelI18n: payload.labelI18n,
      sortOrder: payload.sortOrder ?? 0,
      status: payload.status ?? 1,
      extra: payload.extra
    });
    const saved = await this.dictItemRepo.save(item);
    await this.dictCache.del(dict.code);
    return saved;
  }

  async updateItem(id: number, payload: UpdateDictItemDto) {
    const item = await this.dictItemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('字典项不存在');
    }
    Object.assign(item, payload);
    const saved = await this.dictItemRepo.save(item);
    await this.invalidateItemCache(saved.dictId);
    return saved;
  }

  async removeItem(id: number) {
    const item = await this.dictItemRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('字典项不存在');
    }
    await this.dictItemRepo.delete({ id });
    await this.invalidateItemCache(item.dictId);
    return true;
  }

  private async invalidateItemCache(dictId: number) {
    const dict = await this.dictRepo.findOne({ where: { id: dictId } });
    if (dict) {
      await this.dictCache.del(dict.code);
    }
  }

  private mapItemsByLang(items: DictItem[], lang?: string) {
    return items.map((item) => {
      if (!lang) {
        return {
          value: item.value,
          label: item.label,
          extra: item.extra
        };
      }
      const primary = item.labelI18n?.[lang];
      const shortLang = lang.includes('-') ? lang.split('-')[0] : lang;
      const fallback = item.labelI18n?.[shortLang];
      const label = primary ?? fallback ?? item.label;
      return {
        value: item.value,
        label,
        extra: item.extra
      };
    });
  }
}
