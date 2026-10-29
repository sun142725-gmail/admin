// 提示词库开放端点：批量同步 / 筛选分页 / 统计（细粒度权限，与既有 prompt-templates CRUD 并存）。
// 权限码：flow:prompt:view（查看/统计）、flow:prompt:manage（批量同步），seed 在 ensureFlowSetup 幂等补齐。
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { PromptLibraryService } from './prompt-library.service';
import { QueryPromptLibraryDto, SyncPromptTemplatesDto } from './dto/prompt-template.dto';

@ApiTags('PromptLibrary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('prompt-library')
export class PromptLibraryGuardedController {
  constructor(private readonly service: PromptLibraryService) {}

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

  @Post('sync')
  @Permissions('flow:prompt:manage')
  sync(@CurrentUser() user: RequestUser, @Body() dto: SyncPromptTemplatesDto) {
    return this.service.sync(user.id, dto);
  }
}
