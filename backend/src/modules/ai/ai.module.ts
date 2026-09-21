// AI 模块：管理端（模型/智能体）+ 对话 + 生图，统一经适配器与模型路由调用上游。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModel } from '../../common/entities/ai-model.entity';
import { AiAgent } from '../../common/entities/ai-agent.entity';
import { AiConversation } from '../../common/entities/ai-conversation.entity';
import { AiMessage } from '../../common/entities/ai-message.entity';
import { AiUsageLog } from '../../common/entities/ai-usage-log.entity';
import { AiImage } from '../../common/entities/ai-image.entity';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { OpenAiCompatibleAdapter } from './core/adapters/openai-compatible.adapter';
import { DifyAdapter } from './core/adapters/dify.adapter';
import { ModelRouterService } from './core/model-router.service';
import { UsageLogService } from './core/usage-log.service';
import { AiModelsService } from './admin/models.service';
import { AiAgentsService } from './admin/agents.service';
import { AiAdminController } from './admin/ai-admin.controller';
import { ConversationsService } from './chat/conversations.service';
import { AiChatService } from './chat/chat.service';
import { AiChatController } from './chat/chat.controller';
import { AiImageService } from './image/image.service';
import { AiImageController } from './image/image.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiModel,
      AiAgent,
      AiConversation,
      AiMessage,
      AiUsageLog,
      AiImage
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
    ConversationsService,
    AiChatService,
    AiImageService
  ],
  controllers: [AiController, AiAdminController, AiChatController, AiImageController],
  exports: [AiService]
})
export class AiModule {}
