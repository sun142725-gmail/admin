// AI 控制器提供解卦接口。
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { InterpretDto } from './dto/interpret.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('interpret')
  async interpret(@Body() dto: InterpretDto) {
    const interpretation = await this.aiService.interpret(dto.lines, dto.topic);
    return { interpretation };
  }
}
