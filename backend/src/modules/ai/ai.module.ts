// AI 模块用于注册 AI 服务与控制器。
import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService]
})
export class AiModule {}
