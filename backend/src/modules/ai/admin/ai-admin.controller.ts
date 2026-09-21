// AI 管理端控制器：模型（含端点与密钥）/智能体（管理权限）+ 启用列表（登录即可）。
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AiModelsService } from './models.service';
import { AiAgentsService } from './agents.service';
import { CreateAgentDto, CreateModelDto, UpdateAgentDto, UpdateModelDto } from './dto/ai-admin.dto';

@ApiTags('AI Admin')
@ApiBearerAuth()
@Controller('ai')
export class AiAdminController {
  constructor(
    private readonly modelsService: AiModelsService,
    private readonly agentsService: AiAgentsService
  ) {}

  // ---------- 模型（一行 = 端点：协议/地址/密钥） ----------
  @Get('admin/models')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:model:manage')
  listModels() {
    return this.modelsService.list();
  }

  @Post('admin/models')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:model:manage')
  createModel(@Body() dto: CreateModelDto) {
    return this.modelsService.create(dto);
  }

  @Put('admin/models/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:model:manage')
  updateModel(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateModelDto) {
    return this.modelsService.update(id, dto);
  }

  @Delete('admin/models/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:model:manage')
  removeModel(@Param('id', ParseIntPipe) id: number) {
    return this.modelsService.remove(id);
  }

  @Post('admin/models/:id/test')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:model:manage')
  testModel(@Param('id', ParseIntPipe) id: number) {
    return this.modelsService.test(id);
  }

  @Post('admin/models/:id/probe-models')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:model:manage')
  probeModelModels(@Param('id', ParseIntPipe) id: number) {
    return this.modelsService.probeModels(id);
  }

  // ---------- 智能体 ----------
  @Get('admin/agents')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:agent:manage')
  listAgents() {
    return this.agentsService.list();
  }

  @Post('admin/agents')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:agent:manage')
  createAgent(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Put('admin/agents/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:agent:manage')
  updateAgent(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAgentDto) {
    return this.agentsService.update(id, dto);
  }

  @Delete('admin/agents/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('ai:agent:manage')
  removeAgent(@Param('id', ParseIntPipe) id: number) {
    return this.agentsService.remove(id);
  }

  // ---------- 启用列表（对话页用，登录即可） ----------
  @Get('agents/enabled')
  @UseGuards(JwtAuthGuard)
  listEnabledAgents() {
    return this.agentsService.listEnabled();
  }
}
