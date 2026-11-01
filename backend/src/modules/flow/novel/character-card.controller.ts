// 角色卡控制器：小说项目角色库 CRUD（前缀 novel-video/characters）。
// 路由顺序约束：本控制器必须在 NovelVideoController 之前注册（见 flow.module.ts controllers
// 数组）——否则 GET /api/novel-video/characters 会被 @Controller('novel-video') 的
// @Get(':id') + ParseIntPipe 捕获而返回 400。
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/auth.interface';
import { NovelPipelineService } from './novel-pipeline.service';
import { CreateCharacterCardDto, UpdateCharacterCardDto } from './character-card.dto';

@ApiTags('Novel Video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('novel-video/characters')
export class CharacterCardController {
  constructor(private readonly pipeline: NovelPipelineService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:view')
  list(@Query('projectId', ParseIntPipe) projectId: number) {
    return this.pipeline.listCharacterCards(projectId);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCharacterCardDto) {
    return this.pipeline.createCharacterCard(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCharacterCardDto) {
    return this.pipeline.updateCharacterCard(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pipeline.removeCharacterCard(id);
  }
}
