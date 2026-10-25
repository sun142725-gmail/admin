// 任务流模块：画布编排 + DAG 执行引擎 + 调试（试运行/断点重跑/SSE 进度）。
// 模型调用复用 AI 模块的路由与用量记录；视频上游按「提交→轮询→取回」三段式适配。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlowDefinition } from '../../common/entities/flow-definition.entity';
import { FlowRun } from '../../common/entities/flow-run.entity';
import { FlowRunNode } from '../../common/entities/flow-run-node.entity';
import { AiModule } from '../ai/ai.module';
import { FlowService } from './flow.service';
import { FlowController } from './flow.controller';
import { FlowEngineService } from './engine/flow-engine.service';
import { RunEventsService } from './engine/run-events.service';
import { VideoUpstreamService } from './engine/video-upstream.service';

@Module({
  imports: [TypeOrmModule.forFeature([FlowDefinition, FlowRun, FlowRunNode]), AiModule],
  providers: [FlowService, FlowEngineService, RunEventsService, VideoUpstreamService],
  controllers: [FlowController],
  exports: [FlowService]
})
export class FlowModule {}
