// 提示词库统一控制器（单轨）：browse/stats/sync 与 CRUD 全部能力挂在 /prompt-library 一条轨上。
// 2026-10 重构：原 /prompt-templates CRUD 双轨（两套分页/两套搜索口径）已并入本控制器并裁剪
// GET /prompt-templates 列表轨（前端零调用，grep 全仓证实）；/internal/prompt-templates 保留给
// Go 回调（InternalTokenGuard，红线不动）。
// 权限码：flow:prompt:view（读）/ flow:prompt:manage（写），与菜单(/prompts)、前端同码；
// seed 在 ensureFlowSetup 幂等补齐两码。
// ⚠️ 路由声明顺序约束：@Get('stats') 必须声明在 @Get(':id') 之前——NestJS 按方法声明顺序注册
// 路由，若 :id 在前，GET /prompt-library/stats 会命中 :id 且 ParseIntPipe 抛 400
// （既有 stats e2e 用例可兜住此回归，重排方法时务必保持顺序）。
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
  QueryPromptLibraryDto,
  SyncPromptTemplatesDto,
  UpdatePromptTemplateDto
} from './dto/prompt-template.dto';

@ApiTags('PromptLibrary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('prompt-library')
export class PromptLibraryController {
  constructor(private readonly service: PromptLibraryService) {}

  // ---------- 读：筛选分页 / 统计（先于 :id 声明，见文件头顺序约束） ----------

  @Get()
  @Permissions('flow:prompt:view')
  search(@Query() query: QueryPromptLibraryDto) {
    return this.service.search(query);
  }

  @Get('stats')
  @Permissions('flow:prompt:view')
  stats() {
    return this.service.stats();
  }

  // ---------- 写：批量同步 / CRUD ----------

  @Post('sync')
  @Permissions('flow:prompt:manage')
  sync(@CurrentUser() user: RequestUser, @Body() dto: SyncPromptTemplatesDto) {
    return this.service.sync(user.id, dto);
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

  /**
   * force 二段确认：referenceCount>0 的模板直接删会 409（ConflictException），
   * 前端弹引用数警示后带 ?force=true 重发才物理删除。
   */
  @Delete(':id')
  @Permissions('flow:prompt:manage')
  remove(@Param('id', ParseIntPipe) id: number, @Query('force') force?: string) {
    return this.service.remove(id, force === 'true' || force === '1');
  }
}
