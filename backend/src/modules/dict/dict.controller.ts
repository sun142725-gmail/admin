// 字典控制器提供管理与查询接口。
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { BatchQueryDto } from './dto/batch-query.dto';
import { CreateDictDto } from './dto/create-dict.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { QueryDictDto } from './dto/query-dict.dto';
import { UpdateDictDto } from './dto/update-dict.dto';
import { DictService } from './dict.service';

@ApiTags('Dict')
@Controller('dicts')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  @Get('batch')
  @UseGuards(JwtAuthGuard)
  async batch(@Query() query: BatchQueryDto) {
    return this.dictService.batch(query);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:list')
  async list(@Query() query: QueryDictDto) {
    return this.dictService.list(query);
  }

  @Get(':code')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:list')
  async detail(@Param('code') code: string) {
    return this.dictService.detail(code);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:create')
  async create(@Body() payload: CreateDictDto) {
    return this.dictService.create(payload);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:update')
  async update(@Param('id') id: string, @Body() payload: UpdateDictDto) {
    return this.dictService.update(Number(id), payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:delete')
  async remove(@Param('id') id: string) {
    return this.dictService.remove(Number(id));
  }

  @Post(':id/items')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:update')
  async createItem(@Param('id') id: string, @Body() payload: CreateDictItemDto) {
    return this.dictService.createItem(Number(id), payload);
  }
}
