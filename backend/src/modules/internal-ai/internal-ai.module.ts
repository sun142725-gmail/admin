// 内部 AI 模块：Go 引擎回调 Node AI 能力的唯一入口。
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { InternalAiService } from './internal-ai.service';
import { InternalAiController } from './internal-ai.controller';

@Module({
  imports: [AiModule],
  providers: [InternalAiService],
  controllers: [InternalAiController],
  exports: [InternalAiService]
})
export class InternalAiModule {}
