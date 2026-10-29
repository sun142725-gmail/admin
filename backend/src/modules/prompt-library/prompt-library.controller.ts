// 提示词库控制器：JWT 鉴权下的 CRUD（不做细粒度权限，与 profile 类接口同级）。
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard)
@Controller('prompt-templates')
export class PromptLibraryController {
  constructor(private readonly service: PromptLibraryService) {}

  @Get()
  list(@Query() query: QueryPromptTemplateDto) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePromptTemplateDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePromptTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
