// 提示词库控制器：单轨口径——与 /prompt-library 开放端点、菜单(/prompts)、前端按钮共用
// flow:prompt:view（读）/ flow:prompt:manage（写）两枚权限码；/internal/prompt-templates
// 保留给 Go 回调（InternalTokenGuard）不动。seed 在 ensureFlowSetup 幂等补齐两码。
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { PromptLibraryService } from './prompt-library.service';
import {
  CreatePromptTemplateDto,
  QueryPromptTemplateDto,
  UpdatePromptTemplateDto
} from './dto/prompt-template.dto';

@ApiTags('PromptLibrary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('prompt-templates')
export class PromptLibraryController {
  constructor(private readonly service: PromptLibraryService) {}

  @Get()
  @Permissions('flow:prompt:view')
  list(@Query() query: QueryPromptTemplateDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @Permissions('flow:prompt:view')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  @Permissions('flow:prompt:manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePromptTemplateDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  @Permissions('flow:prompt:manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePromptTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('flow:prompt:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
