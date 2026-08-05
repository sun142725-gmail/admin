// 家庭服务实现家庭、成员、待办、公告和移动端用户设置的业务逻辑。
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Family } from '../../common/entities/family.entity';
import { FamilyMember } from '../../common/entities/family-member.entity';
import { FamilyInviteCode } from '../../common/entities/family-invite-code.entity';
import { FamilyTodo } from '../../common/entities/family-todo.entity';
import { FamilyAnnouncement } from '../../common/entities/family-announcement.entity';
import { User } from '../../common/entities/user.entity';
import { UserSetting } from '../../common/entities/user-setting.entity';
import { UserIdentifier } from '../../common/entities/user-identifier.entity';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { QueryTodoDto } from './dto/query-todo.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { PageDto } from './dto/page.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

const MAX_FAMILY_MEMBERS = 20;
const INVITE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

@Injectable()
export class FamilyService {
  constructor(
    @InjectRepository(Family) private readonly familyRepo: Repository<Family>,
    @InjectRepository(FamilyMember) private readonly memberRepo: Repository<FamilyMember>,
    @InjectRepository(FamilyInviteCode) private readonly inviteRepo: Repository<FamilyInviteCode>,
    @InjectRepository(FamilyTodo) private readonly todoRepo: Repository<FamilyTodo>,
    @InjectRepository(FamilyAnnouncement) private readonly announcementRepo: Repository<FamilyAnnouncement>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserSetting) private readonly settingRepo: Repository<UserSetting>,
    @InjectRepository(UserIdentifier) private readonly identifierRepo: Repository<UserIdentifier>
  ) {}

  private toId(id: string | number) {
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('参数错误');
    }
    return parsed;
  }

  private userName(user?: User) {
    return user?.nickname || user?.username || '';
  }

  private memberNickname(user?: User | null) {
    return (user?.nickname || user?.username || '家庭成员').trim().slice(0, 20);
  }

  private async getSetting(userId: number) {
    let setting = await this.settingRepo.findOne({ where: { userId } });
    if (!setting) {
      setting = await this.settingRepo.save(this.settingRepo.create({ userId, notificationEnabled: 1 }));
    }
    return setting;
  }

  private async getMember(familyId: number, userId: number) {
    return this.memberRepo.findOne({ where: { familyId, userId }, relations: ['user'] });
  }

  private async requireMember(familyId: number, userId: number) {
    const member = await this.getMember(familyId, userId);
    if (!member) {
      throw new ForbiddenException('无家庭访问权限');
    }
    return member;
  }

  private async requireOwner(familyId: number, userId: number) {
    const member = await this.requireMember(familyId, userId);
    if (member.role !== 'owner') {
      throw new ForbiddenException('仅房主可操作');
    }
    return member;
  }

  private async memberCount(familyId: number) {
    return this.memberRepo.count({ where: { familyId } });
  }

  private async formatFamily(family: Family, role?: 'owner' | 'member') {
    return {
      id: String(family.id),
      name: family.name,
      avatar: family.avatar,
      ownerId: String(family.ownerId),
      memberCount: await this.memberCount(family.id),
      ...(role ? { role } : {}),
      createdAt: family.createdAt
    };
  }

  private formatMember(member: FamilyMember) {
    return {
      id: String(member.id),
      userId: String(member.userId),
      nickname: member.nickname,
      avatarUrl: member.user?.avatarUrl ?? '',
      role: member.role,
      joinedAt: member.joinedAt
    };
  }

  private formatTodo(todo: FamilyTodo) {
    return {
      id: String(todo.id),
      title: todo.title,
      creatorId: String(todo.creatorId),
      creatorName: this.userName(todo.creator),
      assigneeId: String(todo.assigneeId),
      assigneeName: this.userName(todo.assignee),
      assigneeAvatar: todo.assignee?.avatarUrl ?? '',
      dueDate: todo.dueDate,
      status: todo.status,
      completedAt: todo.completedAt ?? null,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt
    };
  }

  private formatAnnouncement(announcement: FamilyAnnouncement) {
    return {
      id: String(announcement.id),
      title: announcement.title,
      content: announcement.content,
      publisherId: String(announcement.publisherId),
      publisherName: this.userName(announcement.publisher),
      publishedAt: announcement.publishedAt,
      createdAt: announcement.createdAt
    };
  }

  async createFamily(userId: number, dto: CreateFamilyDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const family = await this.familyRepo.save(this.familyRepo.create({ ...dto, ownerId: userId }));
    await this.memberRepo.save(
      this.memberRepo.create({
        familyId: family.id,
        userId,
        nickname: this.memberNickname(user),
        role: 'owner',
        joinedAt: new Date()
      })
    );
    await this.switchFamily(userId, family.id);
    return this.formatFamily(family);
  }

  async joinFamily(userId: number, code: string) {
    const invite = await this.inviteRepo.findOne({
      where: { code: code.trim().toUpperCase(), isActive: 1 },
      relations: ['family']
    });
    if (!invite) {
      throw new NotFoundException('邀请码不存在');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('邀请码已过期');
    }
    const exists = await this.getMember(invite.familyId, userId);
    if (exists) {
      throw new BadRequestException('已加入该家庭');
    }
    if ((await this.memberCount(invite.familyId)) >= MAX_FAMILY_MEMBERS) {
      throw new BadRequestException('家庭人数已满');
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    await this.memberRepo.save(
      this.memberRepo.create({
        familyId: invite.familyId,
        userId,
        nickname: this.memberNickname(user),
        role: 'member',
        joinedAt: new Date()
      })
    );
    await this.switchFamily(userId, invite.familyId);
    return { familyId: String(invite.familyId), name: invite.family.name, joined: true };
  }

  async listFamilies(userId: number) {
    const members = await this.memberRepo.find({ where: { userId }, relations: ['family'] });
    const setting = await this.getSetting(userId);
    return {
      families: await Promise.all(members.map((member) => this.formatFamily(member.family, member.role))),
      currentFamilyId: setting.currentFamilyId ? String(setting.currentFamilyId) : null
    };
  }

  async familyDetail(userId: number, familyIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const family = await this.familyRepo.findOne({ where: { id: familyId } });
    if (!family) {
      throw new NotFoundException('家庭不存在');
    }
    const members = await this.memberRepo.find({ where: { familyId }, relations: ['user'], order: { id: 'ASC' } });
    return { ...(await this.formatFamily(family)), members: members.map((member) => this.formatMember(member)) };
  }

  async updateFamily(userId: number, familyIdRaw: string, dto: UpdateFamilyDto) {
    const familyId = this.toId(familyIdRaw);
    await this.requireOwner(familyId, userId);
    const family = await this.familyRepo.findOne({ where: { id: familyId } });
    if (!family) {
      throw new NotFoundException('家庭不存在');
    }
    Object.assign(family, dto);
    await this.familyRepo.save(family);
    return this.formatFamily(family);
  }

  async deleteFamily(userId: number, familyIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireOwner(familyId, userId);
    await this.familyRepo.delete({ id: familyId });
    return { success: true };
  }

  async switchFamily(userId: number, familyIdRaw: string | number) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const setting = await this.getSetting(userId);
    setting.currentFamilyId = familyId;
    await this.settingRepo.save(setting);
    return { currentFamilyId: String(familyId) };
  }

  private async createInviteCodeValue() {
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const code = Array.from({ length: 6 }, () => INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]).join('');
      if (!(await this.inviteRepo.findOne({ where: { code } }))) {
        return code;
      }
    }
    throw new BadRequestException('邀请码生成失败');
  }

  async generateInviteCode(userId: number, familyIdRaw: string | number, expireDays = 7) {
    const familyId = this.toId(familyIdRaw);
    await this.requireOwner(familyId, userId);
    await this.inviteRepo.update({ familyId }, { isActive: 0 });
    const invite = await this.inviteRepo.save(
      this.inviteRepo.create({
        familyId,
        code: await this.createInviteCodeValue(),
        expiresAt: new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000),
        isActive: 1
      })
    );
    return { code: invite.code, familyId: String(familyId), expiresAt: invite.expiresAt, createdAt: invite.createdAt };
  }

  async currentInviteCode(userId: number, familyIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireOwner(familyId, userId);
    const invite = await this.inviteRepo.findOne({ where: { familyId, isActive: 1 }, order: { id: 'DESC' } });
    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      return this.generateInviteCode(userId, familyId, 7);
    }
    return { code: invite.code, expiresAt: invite.expiresAt, createdAt: invite.createdAt };
  }

  async listMembers(userId: number, familyIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const members = await this.memberRepo.find({ where: { familyId }, relations: ['user'], order: { id: 'ASC' } });
    return { list: members.map((member) => this.formatMember(member)), total: members.length };
  }

  async updateMember(userId: number, familyIdRaw: string, memberIdRaw: string, nickname: string) {
    const familyId = this.toId(familyIdRaw);
    const memberId = this.toId(memberIdRaw);
    await this.requireOwner(familyId, userId);
    const member = await this.memberRepo.findOne({ where: { id: memberId, familyId }, relations: ['user'] });
    if (!member) {
      throw new NotFoundException('成员不存在');
    }
    member.nickname = nickname;
    await this.memberRepo.save(member);
    return this.formatMember(member);
  }

  async removeMember(userId: number, familyIdRaw: string, memberIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    const memberId = this.toId(memberIdRaw);
    await this.requireOwner(familyId, userId);
    const member = await this.memberRepo.findOne({ where: { id: memberId, familyId } });
    if (!member) {
      throw new NotFoundException('成员不存在');
    }
    if (member.role === 'owner') {
      throw new BadRequestException('不能移除房主');
    }
    await this.memberRepo.delete({ id: memberId });
    return { success: true };
  }

  async leaveFamily(userId: number, familyIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    const member = await this.requireMember(familyId, userId);
    if (member.role === 'owner') {
      throw new BadRequestException('房主不能退出家庭');
    }
    await this.memberRepo.delete({ id: member.id });
    return { success: true };
  }

  async listJoinRequests(userId: number, familyIdRaw: string) {
    await this.requireOwner(this.toId(familyIdRaw), userId);
    return { list: [] };
  }

  async processJoinRequest(userId: number, familyIdRaw: string) {
    await this.requireOwner(this.toId(familyIdRaw), userId);
    return { success: true };
  }

  async listTodos(userId: number, familyIdRaw: string, query: QueryTodoDto) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = query.status ? { familyId, status: query.status } : { familyId };
    const [list, total] = await this.todoRepo.findAndCount({
      where,
      relations: ['creator', 'assignee'],
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { list: list.map((todo) => this.formatTodo(todo)), total, page, pageSize };
  }

  private async requireTodo(familyId: number, todoIdRaw: string) {
    const todo = await this.todoRepo.findOne({
      where: { id: this.toId(todoIdRaw), familyId },
      relations: ['creator', 'assignee']
    });
    if (!todo) {
      throw new NotFoundException('待办不存在');
    }
    return todo;
  }

  private async ensureAssignee(familyId: number, assigneeId: number) {
    const member = await this.getMember(familyId, assigneeId);
    if (!member) {
      throw new BadRequestException('执行人不是家庭成员');
    }
  }

  async todoDetail(userId: number, familyIdRaw: string, todoId: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    return this.formatTodo(await this.requireTodo(familyId, todoId));
  }

  async createTodo(userId: number, familyIdRaw: string, dto: CreateTodoDto) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    await this.ensureAssignee(familyId, dto.assigneeId);
    const todo = await this.todoRepo.save(
      this.todoRepo.create({ familyId, creatorId: userId, assigneeId: dto.assigneeId, title: dto.title, dueDate: dto.dueDate })
    );
    return this.formatTodo(await this.requireTodo(familyId, String(todo.id)));
  }

  async updateTodo(userId: number, familyIdRaw: string, todoId: string, dto: UpdateTodoDto) {
    const familyId = this.toId(familyIdRaw);
    const member = await this.requireMember(familyId, userId);
    const todo = await this.requireTodo(familyId, todoId);
    if (todo.status === 'completed') {
      throw new BadRequestException('已完成待办不允许修改');
    }
    if (todo.creatorId !== userId && member.role !== 'owner') {
      throw new ForbiddenException('无待办编辑权限');
    }
    if (dto.assigneeId) {
      await this.ensureAssignee(familyId, dto.assigneeId);
    }
    Object.assign(todo, dto);
    await this.todoRepo.save(todo);
    return this.formatTodo(await this.requireTodo(familyId, todoId));
  }

  async setTodoStatus(userId: number, familyIdRaw: string, todoId: string, status: 'pending' | 'completed') {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const todo = await this.requireTodo(familyId, todoId);
    todo.status = status;
    todo.completedAt = status === 'completed' ? new Date() : null;
    await this.todoRepo.save(todo);
    return { id: String(todo.id), status: todo.status, completedAt: todo.completedAt };
  }

  async deleteTodo(userId: number, familyIdRaw: string, todoId: string) {
    const familyId = this.toId(familyIdRaw);
    const member = await this.requireMember(familyId, userId);
    const todo = await this.requireTodo(familyId, todoId);
    if (todo.creatorId !== userId && member.role !== 'owner') {
      throw new ForbiddenException('无待办删除权限');
    }
    await this.todoRepo.delete({ id: todo.id });
    return { success: true };
  }

  async listAnnouncements(userId: number, familyIdRaw: string, query: PageDto) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [list, total] = await this.announcementRepo.findAndCount({
      where: { familyId },
      relations: ['publisher'],
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { list: list.map((item) => this.formatAnnouncement(item)), total, page, pageSize };
  }

  async announcementDetail(userId: number, familyIdRaw: string, announcementIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const announcement = await this.announcementRepo.findOne({
      where: { id: this.toId(announcementIdRaw), familyId },
      relations: ['publisher']
    });
    if (!announcement) {
      throw new NotFoundException('公告不存在');
    }
    return this.formatAnnouncement(announcement);
  }

  async createAnnouncement(userId: number, familyIdRaw: string, dto: CreateAnnouncementDto) {
    const familyId = this.toId(familyIdRaw);
    await this.requireOwner(familyId, userId);
    const announcement = await this.announcementRepo.save(
      this.announcementRepo.create({ familyId, publisherId: userId, title: dto.title, content: dto.content, publishedAt: new Date() })
    );
    return this.announcementDetail(userId, familyIdRaw, String(announcement.id));
  }

  async deleteAnnouncement(userId: number, familyIdRaw: string, announcementIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireOwner(familyId, userId);
    const announcement = await this.announcementRepo.findOne({ where: { id: this.toId(announcementIdRaw), familyId } });
    if (!announcement) {
      throw new NotFoundException('公告不存在');
    }
    await this.announcementRepo.delete({ id: announcement.id });
    return { success: true };
  }

  async dashboard(userId: number, familyIdRaw: string) {
    const familyId = this.toId(familyIdRaw);
    await this.requireMember(familyId, userId);
    const family = await this.familyRepo.findOne({ where: { id: familyId } });
    if (!family) {
      throw new NotFoundException('家庭不存在');
    }
    const members = await this.memberRepo.find({ where: { familyId }, relations: ['user'], take: 5, order: { id: 'ASC' } });
    const pendingTodoCount = await this.todoRepo.count({ where: { familyId, status: 'pending' } });
    const noticeCount = await this.announcementRepo.count({ where: { familyId } });
    const latestAnnouncement = await this.announcementRepo.findOne({ where: { familyId }, order: { id: 'DESC' } });
    const latestTodos = await this.todoRepo.find({
      where: { familyId },
      relations: ['assignee'],
      order: { id: 'DESC' },
      take: 2
    });
    const memberCount = await this.memberCount(familyId);
    return {
      family: { id: String(family.id), name: family.name, avatar: family.avatar, memberCount },
      members: members.map((member) => {
        const formatted = this.formatMember(member);
        return { id: formatted.id, userId: formatted.userId, nickname: formatted.nickname, avatarUrl: formatted.avatarUrl, role: formatted.role };
      }),
      stats: { memberCount, pendingTodoCount, noticeCount },
      latestAnnouncement: latestAnnouncement
        ? { id: String(latestAnnouncement.id), title: latestAnnouncement.title, publishedAt: latestAnnouncement.publishedAt }
        : null,
      latestTodos: latestTodos.map((todo) => ({
        id: String(todo.id),
        title: todo.title,
        assigneeName: this.userName(todo.assignee),
        assigneeAvatar: todo.assignee?.avatarUrl ?? '',
        dueDate: todo.dueDate,
        status: todo.status
      }))
    };
  }

  async updateUserProfile(userId: number, dto: UpdateUserProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    Object.assign(user, dto);
    await this.userRepo.save(user);
    return this.profile(userId);
  }

  async profile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const identifiers = await this.identifierRepo.find({ where: { userId, status: 1 } });
    const setting = await this.getSetting(userId);
    return {
      id: String(user.id),
      username: user.username,
      nickname: user.nickname ?? '',
      avatarUrl: user.avatarUrl ?? '',
      phone: identifiers.find((item) => item.identifierType === 'sms')?.identifierValue ?? '',
      email: user.email ?? identifiers.find((item) => item.identifierType === 'email')?.identifierValue ?? '',
      currentFamilyId: setting.currentFamilyId ? String(setting.currentFamilyId) : null
    };
  }

  async settings(userId: number) {
    const setting = await this.getSetting(userId);
    return { notificationEnabled: Boolean(setting.notificationEnabled) };
  }

  async updateSettings(userId: number, notificationEnabled: boolean) {
    const setting = await this.getSetting(userId);
    setting.notificationEnabled = notificationEnabled ? 1 : 0;
    await this.settingRepo.save(setting);
    return this.settings(userId);
  }
}
