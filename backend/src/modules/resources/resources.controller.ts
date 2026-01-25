// 资源控制器提供菜单与资源接口。
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { ResourcesService } from './resources.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

@ApiTags('Resources')
@ApiBearerAuth()
@Controller('resources')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get('tree')
  async tree() {
    return this.resourcesService.tree();
  }

  @Post()
  @Permissions('system:resource:create')
  async create(
    @Body() dto: CreateResourceDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.resourcesService.create(dto, user.id, req.ip);
  }

  @Patch(':id')
  @Permissions('system:resource:update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.resourcesService.update(Number(id), dto, user.id, req.ip);
  }

  @Delete(':id')
  @Permissions('system:resource:delete')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.resourcesService.remove(Number(id), user.id, req.ip);
  }
}
