// 提示词库模块：统一控制器（/prompt-library 单轨）+ Go 回调内部控制器。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromptTemplate } from '../../common/entities/prompt-template.entity';
import { PromptLibraryService } from './prompt-library.service';
import { PromptLibraryController } from './prompt-library.controller';
import { InternalPromptLibraryController } from './internal-prompt-library.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PromptTemplate])],
  providers: [PromptLibraryService],
  controllers: [PromptLibraryController, InternalPromptLibraryController],
  exports: [PromptLibraryService]
})
export class PromptLibraryModule {}
