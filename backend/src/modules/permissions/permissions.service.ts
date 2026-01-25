// 权限服务负责权限码管理。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../common/entities/permission.entity';
import { AuditService } from '../audit/audit.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    private readonly auditService: AuditService
  ) {}

  async list(page = 1, pageSize = 20) {
    const [items, total] = await this.permissionRepo.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items, total, page, pageSize };
  }

  async create(dto: CreatePermissionDto, operatorId?: number, ip?: string) {
    const exists = await this.permissionRepo.findOne({ where: { code: dto.code } });
    if (exists) {
      throw new BadRequestException('权限码已存在');
    }
    const permission = this.permissionRepo.create(dto);
    const saved = await this.permissionRepo.save(permission);
    await this.auditService.log('create', 'permissions', `创建权限 ${saved.code}`, operatorId, ip);
    return saved;
  }

  async update(id: number, dto: UpdatePermissionDto, operatorId?: number, ip?: string) {
    const permission = await this.permissionRepo.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException('权限不存在');
    }
    Object.assign(permission, dto);
    const saved = await this.permissionRepo.save(permission);
    await this.auditService.log('update', 'permissions', `更新权限 ${saved.code}`, operatorId, ip);
    return saved;
  }

  async remove(id: number, operatorId?: number, ip?: string) {
    const permission = await this.permissionRepo.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException('权限不存在');
    }
    await this.permissionRepo.remove(permission);
    await this.auditService.log('delete', 'permissions', `删除权限 ${permission.code}`, operatorId, ip);
    return { success: true };
  }
}
