// 角色控制器提供角色管理接口。
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('system:role:list')
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.rolesService.list(Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Post()
  @Permissions('system:role:create')
  async create(@Body() dto: CreateRoleDto, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.rolesService.create(dto, user.id, req.ip);
  }

  @Patch(':id')
  @Permissions('system:role:update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.rolesService.update(Number(id), dto, user.id, req.ip);
  }

  @Delete(':id')
  @Permissions('system:role:delete')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.rolesService.remove(Number(id), user.id, req.ip);
  }

  @Post(':id/permissions')
  @Permissions('system:role:assign')
  async assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.rolesService.assignPermissions(Number(id), dto, user.id, req.ip);
  }

  @Get(':id/users')
  @Permissions('system:role:users')
  async users(@Param('id') id: string) {
    return this.rolesService.usersByRole(Number(id));
  }
}
