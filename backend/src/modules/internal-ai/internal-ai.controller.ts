// 内部 AI 控制器：仅供 Go 服务调用（X-Internal-Token 鉴权），不暴露给前端。
// 注意：全局前缀 api 下实际路径为 /api/internal/ai/*。
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalAiService } from './internal-ai.service';
import { InternalTokenGuard } from './internal-token.guard';
import { InternalChatDto, InternalImageDto, InternalTtsDto } from './dto/internal-ai.dto';

@ApiTags('InternalAi')
@UseGuards(InternalTokenGuard)
@Controller('internal/ai')
export class InternalAiController {
  constructor(private readonly service: InternalAiService) {}

  @Post('chat')
  chat(@Body() dto: InternalChatDto) {
    return this.service.chat(dto);
  }

  @Post('image')
  image(@Body() dto: InternalImageDto) {
    return this.service.image(dto);
  }

  @Post('tts')
  tts(@Body() dto: InternalTtsDto) {
    return this.service.tts(dto);
  }
}
