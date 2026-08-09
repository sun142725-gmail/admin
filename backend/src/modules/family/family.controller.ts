// 家庭控制器提供移动端家庭、成员、待办、公告与概览接口。
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { FamilyService } from './family.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { InviteCodeDto } from './dto/invite-code.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryTodoDto } from './dto/query-todo.dto';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { PageDto } from './dto/page.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { QueryMilestoneDto } from './dto/query-milestone.dto';
import { ToggleMilestoneCoreDto } from './dto/toggle-milestone-core.dto';

@ApiTags('Family')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('family')
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Post('create')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFamilyDto) {
    return this.familyService.createFamily(user.id, dto);
  }

  @Post('join')
  join(@CurrentUser() user: RequestUser, @Body() dto: JoinFamilyDto) {
    return this.familyService.joinFamily(user.id, dto.code);
  }

  @Get('list')
  list(@CurrentUser() user: RequestUser) {
    return this.familyService.listFamilies(user.id);
  }

  @Get(':familyId/detail')
  detail(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.familyDetail(user.id, familyId);
  }

  @Put(':familyId/update')
  update(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Body() dto: UpdateFamilyDto) {
    return this.familyService.updateFamily(user.id, familyId, dto);
  }

  @Delete(':familyId')
  delete(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.deleteFamily(user.id, familyId);
  }

  @Post(':familyId/switch')
  switch(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.switchFamily(user.id, familyId);
  }

  @Post(':familyId/invite-code')
  generateInviteCode(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Body() dto: InviteCodeDto) {
    return this.familyService.generateInviteCode(user.id, familyId, dto.expireDays ?? 7);
  }

  @Get(':familyId/invite-code')
  inviteCode(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.currentInviteCode(user.id, familyId);
  }

  @Get(':familyId/members')
  members(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.listMembers(user.id, familyId);
  }

  @Put(':familyId/members/:memberId')
  updateMember(
    @CurrentUser() user: RequestUser,
    @Param('familyId') familyId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto
  ) {
    return this.familyService.updateMember(user.id, familyId, memberId, dto.nickname);
  }

  @Delete(':familyId/members/:memberId')
  removeMember(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Param('memberId') memberId: string) {
    return this.familyService.removeMember(user.id, familyId, memberId);
  }

  @Post(':familyId/leave')
  leave(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.leaveFamily(user.id, familyId);
  }

  @Get(':familyId/join-requests')
  joinRequests(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.listJoinRequests(user.id, familyId);
  }

  @Post(':familyId/join-requests/:requestId/approve')
  approveRequest(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.processJoinRequest(user.id, familyId);
  }

  @Post(':familyId/join-requests/:requestId/reject')
  rejectRequest(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.processJoinRequest(user.id, familyId);
  }

  @Get(':familyId/todos')
  todos(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Query() query: QueryTodoDto) {
    return this.familyService.listTodos(user.id, familyId, query);
  }

  @Get(':familyId/todos/:todoId')
  todoDetail(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Param('todoId') todoId: string) {
    return this.familyService.todoDetail(user.id, familyId, todoId);
  }

  @Post(':familyId/todos')
  createTodo(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Body() dto: CreateTodoDto) {
    return this.familyService.createTodo(user.id, familyId, dto);
  }

  @Put(':familyId/todos/:todoId')
  updateTodo(
    @CurrentUser() user: RequestUser,
    @Param('familyId') familyId: string,
    @Param('todoId') todoId: string,
    @Body() dto: UpdateTodoDto
  ) {
    return this.familyService.updateTodo(user.id, familyId, todoId, dto);
  }

  @Patch(':familyId/todos/:todoId/complete')
  completeTodo(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Param('todoId') todoId: string) {
    return this.familyService.setTodoStatus(user.id, familyId, todoId, 'completed');
  }

  @Patch(':familyId/todos/:todoId/incomplete')
  incompleteTodo(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Param('todoId') todoId: string) {
    return this.familyService.setTodoStatus(user.id, familyId, todoId, 'pending');
  }

  @Delete(':familyId/todos/:todoId')
  deleteTodo(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Param('todoId') todoId: string) {
    return this.familyService.deleteTodo(user.id, familyId, todoId);
  }

  @Get(':familyId/milestones')
  milestones(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Query() query: QueryMilestoneDto) {
    return this.familyService.listMilestones(user.id, familyId, query);
  }

  @Get(':familyId/milestones/summary')
  milestoneSummary(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Query('type') type: 'personal' | 'family') {
    return this.familyService.milestoneSummary(user.id, familyId, type);
  }

  @Get(':familyId/milestones/:milestoneId')
  milestoneDetail(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Param('milestoneId') milestoneId: string) {
    return this.familyService.milestoneDetail(user.id, familyId, milestoneId);
  }

  @Post(':familyId/milestones')
  createMilestone(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Body() dto: CreateMilestoneDto) {
    return this.familyService.createMilestone(user.id, familyId, dto);
  }

  @Put(':familyId/milestones/:milestoneId')
  updateMilestone(
    @CurrentUser() user: RequestUser,
    @Param('familyId') familyId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto
  ) {
    return this.familyService.updateMilestone(user.id, familyId, milestoneId, dto);
  }

  @Patch(':familyId/milestones/:milestoneId/core')
  toggleMilestoneCore(
    @CurrentUser() user: RequestUser,
    @Param('familyId') familyId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: ToggleMilestoneCoreDto
  ) {
    return this.familyService.toggleMilestoneCore(user.id, familyId, milestoneId, dto.isCore);
  }

  @Delete(':familyId/milestones/:milestoneId')
  deleteMilestone(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Param('milestoneId') milestoneId: string) {
    return this.familyService.deleteMilestone(user.id, familyId, milestoneId);
  }

  @Get(':familyId/announcements')
  announcements(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Query() query: PageDto) {
    return this.familyService.listAnnouncements(user.id, familyId, query);
  }

  @Get(':familyId/announcements/:announcementId')
  announcementDetail(
    @CurrentUser() user: RequestUser,
    @Param('familyId') familyId: string,
    @Param('announcementId') announcementId: string
  ) {
    return this.familyService.announcementDetail(user.id, familyId, announcementId);
  }

  @Post(':familyId/announcements')
  createAnnouncement(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Body() dto: CreateAnnouncementDto) {
    return this.familyService.createAnnouncement(user.id, familyId, dto);
  }

  @Delete(':familyId/announcements/:announcementId')
  deleteAnnouncement(
    @CurrentUser() user: RequestUser,
    @Param('familyId') familyId: string,
    @Param('announcementId') announcementId: string
  ) {
    return this.familyService.deleteAnnouncement(user.id, familyId, announcementId);
  }

  @Get(':familyId/dashboard')
  dashboard(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
    return this.familyService.dashboard(user.id, familyId);
  }
}
