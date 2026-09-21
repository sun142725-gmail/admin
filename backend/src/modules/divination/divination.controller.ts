// 占卜控制器提供创建、查询、流式解卦与管理接口。
import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  SetMetadata,
  Sse,
  UseGuards
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { SKIP_RESPONSE_WRAP_KEY } from '../../common/constants';
import { CreateDivinationDto } from './dto/create-divination.dto';
import { SetTopicDto } from './dto/set-topic.dto';
import { DivinationService } from './divination.service';

@ApiTags('Divinations')
@ApiBearerAuth()
@Controller('divinations')
@UseGuards(JwtAuthGuard)
export class DivinationController {
  constructor(private readonly divinationService: DivinationService) {}

  @Post()
  async create(@Body() dto: CreateDivinationDto, @CurrentUser() user: RequestUser) {
    return this.divinationService.create(dto.topic, user?.id);
  }

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.divinationService.list(user?.id, Number(page ?? 1), Number(pageSize ?? 20));
  }

  // SSE 流式解卦：实时推送 AI 解卦分片，事件类型 chunk / done / error。
  // 跳过统一响应包装，保持标准 SSE 事件格式；响应头（禁缓冲）由中间件提前设置。
  @Sse(':id/interpretation/stream')
  @SetMetadata(SKIP_RESPONSE_WRAP_KEY, true)
  stream(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser
  ): Observable<MessageEvent> {
    return this.divinationService.streamInterpretation(id, user?.id);
  }

  @Get(':id')
  async getById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser
  ) {
    return this.divinationService.getById(id, user?.id);
  }

  @Patch(':id/topic')
  async setTopic(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTopicDto,
    @CurrentUser() user: RequestUser
  ) {
    return this.divinationService.setTopic(id, dto.topic, user?.id);
  }

  @Post(':id/reinterpret')
  async reinterpret(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser
  ) {
    return this.divinationService.reinterpret(id, user?.id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.divinationService.remove(id, user?.id);
  }
}
