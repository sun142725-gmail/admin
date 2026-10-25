// 任务流控制器：流程 CRUD（管理权限）+ 运行触发/取消/重跑（执行权限）+ 历史与 SSE 进度（查看权限）。
// 注意：具名路由（runs/...）必须声明在参数路由（:id）之前，否则会被 ParseIntPipe 拦截。
import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  SetMetadata,
  Sse,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { concat, from, mergeMap, of } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { SKIP_RESPONSE_WRAP_KEY } from '../../common/constants';
import { FlowService } from './flow.service';
import { RunEventsService } from './engine/run-events.service';
import { CreateFlowDto, SingleRunDto, StartRunDto, UpdateFlowDto } from './dto/flow.dto';

const TERMINAL_STATUSES = ['succeeded', 'failed', 'cancelled'];

@ApiTags('Flow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('flows')
export class FlowController {
  constructor(
    private readonly flows: FlowService,
    private readonly events: RunEventsService
  ) {}

  // ---------- 运行（执行权限） ----------
  @Post(':id/runs')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:execute')
  startRun(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StartRunDto
  ) {
    return this.flows.startRun(user.id, id, dto);
  }

  @Post('runs/single')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:execute')
  startSingle(@CurrentUser() user: RequestUser, @Body() dto: SingleRunDto) {
    return this.flows.startSingle(user.id, dto);
  }

  @Post('runs/:id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:execute')
  cancelRun(@Param('id', ParseIntPipe) id: number) {
    return this.flows.cancelRun(id);
  }

  @Post('runs/:id/retry')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:execute')
  retryRun(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.flows.retryRun(user.id, id);
  }

  // ---------- 历史与进度（查看权限，具名路由在 :id 之前） ----------
  @Get('runs')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:view')
  runs(@Query('flowId') flowId?: string, @Query('status') status?: string, @Query('take') take?: string) {
    return this.flows.runs({
      flowId: flowId ? Number(flowId) : undefined,
      status,
      take: take ? Number(take) : undefined
    });
  }

  @Get('runs/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:view')
  runDetail(@Param('id', ParseIntPipe) id: number) {
    return this.flows.runDetail(id);
  }

  // SSE 进度流：init 事件带全量快照（断线重连可用），后续为增量 node/run 事件。
  @Sse('runs/:id/stream')
  @SetMetadata(SKIP_RESPONSE_WRAP_KEY, true)
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:view')
  stream(@Param('id', ParseIntPipe) id: number) {
    return from(this.flows.runDetail(id)).pipe(
      mergeMap(({ run, nodes }) => {
        const init: MessageEvent = { type: 'init', data: { runId: id, run, nodes } };
        if (TERMINAL_STATUSES.includes(run.status)) {
          return of(init);
        }
        return concat(of(init), this.events.subscribe(id));
      })
    );
  }

  // ---------- 流程定义（管理权限） ----------
  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  list() {
    return this.flows.list();
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.flows.detail(id);
  }

  // 最近一次成功运行的节点产物（试运行 mock 预填，执行权限）。
  @Get(':id/latest-outputs')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:run:execute')
  latestOutputs(@Param('id', ParseIntPipe) id: number) {
    return this.flows.latestOutputs(id);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFlowDto) {
    return this.flows.create(user.id, dto);
  }

  @Post(':id/duplicate')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.flows.duplicate(id, user.id);
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFlowDto) {
    return this.flows.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('flow:define:manage')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.flows.remove(id);
  }
}
