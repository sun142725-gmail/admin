// 小说转视频控制器：项目 CRUD + 一键运行/取消/重切分（复用任务流权限码）。
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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/auth.interface';
import { NovelPipelineService } from './novel-pipeline.service';
import { CreateNovelProjectDto, UpdateNovelProjectDto } from './novel-video.dto';

@ApiTags('Novel Video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('novel-video')
export class NovelVideoController {
  constructor(private readonly pipeline: NovelPipelineService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:view')
  list() {
    return this.pipeline.list();
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateNovelProjectDto) {
    return this.pipeline.create(user.id, dto);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.pipeline.detail(id);
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNovelProjectDto) {
    return this.pipeline.update(id, dto);
  }

  @Post(':id/split')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  reSplit(@Param('id', ParseIntPipe) id: number) {
    return this.pipeline.reSplit(id);
  }

  @Post(':id/run')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:execute')
  run(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.pipeline.run(user.id, id);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:execute')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.pipeline.cancel(id);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pipeline.remove(id);
  }
}
