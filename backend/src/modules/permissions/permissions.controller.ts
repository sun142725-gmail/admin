// 权限控制器提供权限码管理接口。
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Permissions('system:permission:list')
  async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.permissionsService.list(Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Post()
  @Permissions('system:permission:create')
  async create(
    @Body() dto: CreatePermissionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.permissionsService.create(dto, user.id, req.ip);
  }

  @Patch(':id')
  @Permissions('system:permission:update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.permissionsService.update(Number(id), dto, user.id, req.ip);
  }

  @Delete(':id')
  @Permissions('system:permission:delete')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.permissionsService.remove(Number(id), user.id, req.ip);
  }
}
