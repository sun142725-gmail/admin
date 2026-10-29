// 提示词库内部控制器：供 Go 流水线获取模板（X-Internal-Token 鉴权），读取即计引用。
import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../internal-ai/internal-token.guard';
import { PromptLibraryService } from './prompt-library.service';

@ApiTags('InternalPromptLibrary')
@UseGuards(InternalTokenGuard)
@Controller('internal/prompt-templates')
export class InternalPromptLibraryController {
  constructor(private readonly service: PromptLibraryService) {}

  @Get(':id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const template = await this.service.detail(id);
    // 引用计数异步累加，不阻塞调用方
    this.service.recordUse(id);
    return {
      id: template.id,
      name: template.name,
      category: template.category,
      template: template.template,
      negativePrompt: template.negativePrompt,
      modelId: template.modelId
    };
  }
}
