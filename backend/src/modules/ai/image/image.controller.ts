// AI 生图控制器。
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/auth.interface';
import { AiImageService } from './image.service';
import { GenerateImageDto } from './dto/image.dto';

@ApiTags('AI Image')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/images')
export class AiImageController {
  constructor(private readonly imageService: AiImageService) {}

  @Post('generations')
  generate(@CurrentUser() user: RequestUser, @Body() dto: GenerateImageDto) {
    return this.imageService.generate(user.id, dto);
  }

  @Get()
  history(@CurrentUser() user: RequestUser) {
    return this.imageService.history(user.id);
  }
}
