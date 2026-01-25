// 角色服务负责角色管理与权限分配。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../../common/entities/role.entity';
import { Permission } from '../../common/entities/permission.entity';
import { User } from '../../common/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService
  ) {}

  async list(page = 1, pageSize = 20) {
    const [items, total] = await this.roleRepo.findAndCount({
      relations: ['permissions'],
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items, total, page, pageSize };
  }

  async create(dto: CreateRoleDto, operatorId?: number, ip?: string) {
    const exists = await this.roleRepo.findOne({ where: { code: dto.code } });
    if (exists) {
      throw new BadRequestException('角色编码已存在');
    }
    const role = this.roleRepo.create(dto);
    const saved = await this.roleRepo.save(role);
    await this.auditService.log('create', 'roles', `创建角色 ${saved.name}`, operatorId, ip);
    return saved;
  }

  async update(id: number, dto: UpdateRoleDto, operatorId?: number, ip?: string) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    Object.assign(role, dto);
    const saved = await this.roleRepo.save(role);
    await this.auditService.log('update', 'roles', `更新角色 ${saved.name}`, operatorId, ip);
    return saved;
  }

  async remove(id: number, operatorId?: number, ip?: string) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    await this.roleRepo.remove(role);
    await this.auditService.log('delete', 'roles', `删除角色 ${role.name}`, operatorId, ip);
    return { success: true };
  }

  async assignPermissions(id: number, dto: AssignPermissionsDto, operatorId?: number, ip?: string) {
    const role = await this.roleRepo.findOne({ where: { id }, relations: ['permissions'] });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    const permissions = await this.permissionRepo.findBy({ id: In(dto.permissionIds) });
    role.permissions = permissions;
    await this.roleRepo.save(role);
    await this.auditService.log('assign_permissions', 'roles', `为角色 ${role.name} 分配权限`, operatorId, ip);
    return { success: true };
  }

  async usersByRole(id: number) {
    const role = await this.roleRepo.findOne({ where: { id }, relations: ['users'] });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    return { role: role.name, users: role.users ?? [] };
  }
}
