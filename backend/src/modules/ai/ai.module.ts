// AI 模块：管理端（模型/智能体）+ 对话 + 生图，统一经适配器与模型路由调用上游。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModel } from '../../common/entities/ai-model.entity';
import { AiAgent } from '../../common/entities/ai-agent.entity';
import { AiConversation } from '../../common/entities/ai-conversation.entity';
import { AiMessage } from '../../common/entities/ai-message.entity';
import { AiUsageLog } from '../../common/entities/ai-usage-log.entity';
import { AiModelPrice } from '../../common/entities/ai-model-price.entity';
import { AiImage } from '../../common/entities/ai-image.entity';
import { AiCanvas } from '../../common/entities/ai-canvas.entity';
import { NovelProject } from '../../common/entities/novel-project.entity';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { OpenAiCompatibleAdapter } from './core/adapters/openai-compatible.adapter';
import { DifyAdapter } from './core/adapters/dify.adapter';
import { ModelRouterService } from './core/model-router.service';
import { UsageLogService } from './core/usage-log.service';
import { AiModelsService } from './admin/models.service';
import { AiAgentsService } from './admin/agents.service';
import { AiModelPricesService } from './admin/model-prices.service';
import { UsageReportService } from './admin/usage-report.service';
import { UsageReportController } from './admin/usage-report.controller';
import { AiAdminController } from './admin/ai-admin.controller';
import { ConversationsService } from './chat/conversations.service';
import { AiChatService } from './chat/chat.service';
import { AiChatController } from './chat/chat.controller';
import { AiImageService } from './image/image.service';
import { AiImageController } from './image/image.controller';
import { CanvasService } from './canvas/canvas.service';
import { CanvasController } from './canvas/canvas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiModel,
      AiAgent,
      AiConversation,
      AiMessage,
      AiUsageLog,
      AiModelPrice,
      AiImage,
      AiCanvas,
      // 报表按项目名映射（usage-report service 用；实体清单仍在 app.module 统一维护）。
      NovelProject
    ])
  ],
  providers: [
    AiService,
    OpenAiCompatibleAdapter,
    DifyAdapter,
    ModelRouterService,
    UsageLogService,
    AiModelsService,
    AiAgentsService,
    AiModelPricesService,
    UsageReportService,
    ConversationsService,
    AiChatService,
    AiImageService,
    CanvasService
  ],
  controllers: [AiController, AiAdminController, UsageReportController, AiChatController, AiImageController, CanvasController],
  // ModelRouterService / UsageLogService 供 stock 等业务模块复用模型路由与用量记录。
  exports: [AiService, ModelRouterService, UsageLogService]
})
export class AiModule {}
