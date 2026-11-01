// 任务流模块：画布编排 + DAG 执行引擎 + 调试（试运行/断点重跑/SSE 进度）。
// 模型调用复用 AI 模块的路由与用量记录；视频上游按「提交→轮询→取回」三段式适配。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlowDefinition } from '../../common/entities/flow-definition.entity';
import { FlowRun } from '../../common/entities/flow-run.entity';
import { FlowRunNode } from '../../common/entities/flow-run-node.entity';
import { NovelProject } from '../../common/entities/novel-project.entity';
import { NovelChapter } from '../../common/entities/novel-chapter.entity';
import { NovelShot } from '../../common/entities/novel-shot.entity';
import { CharacterCard } from '../../common/entities/character-card.entity';
import { AiModule } from '../ai/ai.module';
import { FlowService } from './flow.service';
import { FlowController } from './flow.controller';
import { FlowEngineService } from './engine/flow-engine.service';
import { RunEventsService } from './engine/run-events.service';
import { VideoUpstreamService } from './engine/video-upstream.service';
import { NovelPipelineService } from './novel/novel-pipeline.service';
import { NovelVideoController } from './novel/novel-video.controller';
import { CharacterCardController } from './novel/character-card.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FlowDefinition,
      FlowRun,
      FlowRunNode,
      NovelProject,
      NovelChapter,
      NovelShot,
      CharacterCard
    ]),
    AiModule
  ],
  providers: [FlowService, FlowEngineService, RunEventsService, VideoUpstreamService, NovelPipelineService],
  // CharacterCardController 必须在 NovelVideoController 之前：novel-video/characters 若注册在后，
  // GET /api/novel-video/characters 会被 @Controller('novel-video') 的 @Get(':id') + ParseIntPipe
  // 捕获返回 400（与 prompt-library.controller.ts 头注释同款约束）。
  controllers: [FlowController, CharacterCardController, NovelVideoController],
  exports: [FlowService]
})
export class FlowModule {}
