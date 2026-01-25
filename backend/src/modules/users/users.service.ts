// 用户服务负责用户 CRUD 与角色分配。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../common/entities/user.entity';
import { Role } from '../../common/entities/role.entity';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly auditService: AuditService
  ) {}

  private sanitize(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async list(page = 1, pageSize = 20) {
    const [items, total] = await this.userRepo.findAndCount({
      relations: ['roles'],
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items: items.map((item) => this.sanitize(item)), total, page, pageSize };
  }

  async create(dto: CreateUserDto, operatorId?: number, ip?: string) {
    const exists = await this.userRepo.findOne({ where: { username: dto.username } });
    if (exists) {
      throw new BadRequestException('用户名已存在');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      username: dto.username,
      passwordHash,
      nickname: dto.nickname,
      email: dto.email,
      status: 1
    });
    const saved = await this.userRepo.save(user);
    await this.auditService.log('create', 'users', `创建用户 ${saved.username}`, operatorId, ip);
    return this.sanitize(saved);
  }

  async update(id: number, dto: UpdateUserDto, operatorId?: number, ip?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    await this.auditService.log('update', 'users', `更新用户 ${saved.username}`, operatorId, ip);
    return this.sanitize(saved);
  }

  async disable(id: number, operatorId?: number, ip?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    user.status = 0;
    await this.userRepo.save(user);
    await this.auditService.log('disable', 'users', `禁用用户 ${user.username}`, operatorId, ip);
    return { success: true };
  }

  async remove(id: number, operatorId?: number, ip?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    await this.userRepo.remove(user);
    await this.auditService.log('delete', 'users', `删除用户 ${user.username}`, operatorId, ip);
    return { success: true };
  }

  async resetPassword(id: number, dto: ResetPasswordDto, operatorId?: number, ip?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    user.passwordHash = await bcrypt.hash(dto.password, 10);
    user.tokenVersion += 1;
    await this.userRepo.save(user);
    await this.auditService.log('reset_password', 'users', `重置用户密码 ${user.username}`, operatorId, ip);
    return { success: true };
  }

  async assignRoles(id: number, dto: AssignRolesDto, operatorId?: number, ip?: string) {
    const user = await this.userRepo.findOne({ where: { id }, relations: ['roles'] });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const roles = await this.roleRepo.findBy({ id: In(dto.roleIds) });
    user.roles = roles;
    await this.userRepo.save(user);
    await this.auditService.log('assign_roles', 'users', `分配角色给用户 ${user.username}`, operatorId, ip);
    return { success: true };
  }
}
