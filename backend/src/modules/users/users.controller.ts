// 用户控制器提供用户管理接口。
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('system:user:list')
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.usersService.list(Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Post()
  @Permissions('system:user:create')
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.usersService.create(dto, user.id, req.ip);
  }

  @Patch(':id')
  @Permissions('system:user:update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.usersService.update(Number(id), dto, user.id, req.ip);
  }

  @Patch(':id/disable')
  @Permissions('system:user:disable')
  async disable(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.usersService.disable(Number(id), user.id, req.ip);
  }

  @Delete(':id')
  @Permissions('system:user:delete')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.usersService.remove(Number(id), user.id, req.ip);
  }

  @Post(':id/reset-password')
  @Permissions('system:user:reset')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.usersService.resetPassword(Number(id), dto, user.id, req.ip);
  }

  @Post(':id/roles')
  @Permissions('system:user:assign')
  async assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.usersService.assignRoles(Number(id), dto, user.id, req.ip);
  }
}
