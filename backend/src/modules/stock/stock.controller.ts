// 股市圆桌用户侧接口：发起会议 / SSE 订阅 / 历史与详情。
// 用户侧数据按 userId 隔离，权限码仅用于菜单可见性（与占卜模块一致）。
import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Post,
  Query,
  SetMetadata,
  Sse,
  UseGuards
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModel } from '../../common/entities/ai-model.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { SKIP_RESPONSE_WRAP_KEY } from '../../common/constants';
import { CreateRoundtableDto } from './dto/create-roundtable.dto';
import { RoundtableService } from './roundtable.service';

@ApiTags('Stock Roundtable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(
    private readonly roundtableService: RoundtableService,
    @InjectRepository(AiModel) private readonly modelRepo: Repository<AiModel>
  ) {}

  /** 可选模型列表（登录即可见，供发起会议时选择）。 */
  @Get('models')
  async listModels() {
    const rows = await this.modelRepo.find({ where: { status: 1 } });
    return rows
      .filter((row) => row.capabilities.split(',').includes('chat'))
      .map((row) => ({ id: row.id, displayName: row.displayName, modelKey: row.modelKey }));
  }
}

@ApiTags('Stock Roundtable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock/roundtable')
export class RoundtableController {
  constructor(private readonly roundtableService: RoundtableService) {}

  // 发起会议成本兜底：每 IP 每分钟 6 次（全局限流之上加严）。
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @Post()
  async create(@Body() dto: CreateRoundtableDto, @CurrentUser() user: RequestUser) {
    return this.roundtableService.create(user?.id, dto);
  }

  // SSE 会议流：stage / brief / expert_start / chunk / expert_done / expert_error /
  // vote / summary_chunk / summary_done / done / error / thinking。
  // 跳过统一响应包装，禁缓冲响应头由中间件提前设置。
  @Sse(':id/stream')
  @SetMetadata(SKIP_RESPONSE_WRAP_KEY, true)
  stream(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser
  ): Observable<MessageEvent> {
    return this.roundtableService.stream(id, user?.id);
  }

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.roundtableService.list(user?.id, Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.roundtableService.getById(id, user?.id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.roundtableService.remove(id, user?.id);
  }
}
