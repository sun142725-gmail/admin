// 资源服务负责菜单树与资源管理。
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '../../common/entities/resource.entity';
import { AuditService } from '../audit/audit.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

interface ResourceNode extends Resource {
  children?: ResourceNode[];
}

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
    private readonly auditService: AuditService
  ) {}

  async list() {
    return this.resourceRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async tree() {
    const resources = await this.list();
    const map = new Map<number, ResourceNode>();
    resources.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });
    const roots: ResourceNode[] = [];
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)?.children?.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  async create(dto: CreateResourceDto, operatorId?: number, ip?: string) {
    const resource = this.resourceRepo.create(dto);
    const saved = await this.resourceRepo.save(resource);
    await this.auditService.log('create', 'resources', `创建资源 ${saved.name}`, operatorId, ip);
    return saved;
  }

  async update(id: number, dto: UpdateResourceDto, operatorId?: number, ip?: string) {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) {
      throw new NotFoundException('资源不存在');
    }
    Object.assign(resource, dto);
    const saved = await this.resourceRepo.save(resource);
    await this.auditService.log('update', 'resources', `更新资源 ${saved.name}`, operatorId, ip);
    return saved;
  }

  async remove(id: number, operatorId?: number, ip?: string) {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) {
      throw new NotFoundException('资源不存在');
    }
    await this.resourceRepo.remove(resource);
    await this.auditService.log('delete', 'resources', `删除资源 ${resource.name}`, operatorId, ip);
    return { success: true };
  }
}
