// AI 画布快照控制器：GET/PUT /ai/canvas，只挂 JWT（快照为用户私有数据，无细粒度权限码语义；
// 页面可见性由菜单权限 ai:canvas:view 控制，与 /ai/images 只挂 JwtAuthGuard 同口径）。
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/auth.interface';
import { CanvasService } from './canvas.service';
import { SaveCanvasDto } from './dto/save-canvas.dto';

@ApiTags('AI Canvas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.canvasService.get(user.id);
  }

  @Put()
  save(@CurrentUser() user: RequestUser, @Body() dto: SaveCanvasDto) {
    return this.canvasService.save(user.id, dto);
  }
}
