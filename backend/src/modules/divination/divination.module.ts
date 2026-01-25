// 占卜模块注册实体与服务。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Divination } from '../../common/entities/divination.entity';
import { DivinationLine } from '../../common/entities/divination-line.entity';
import { AiModule } from '../ai/ai.module';
import { DivinationService } from './divination.service';
import { DivinationController } from './divination.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Divination, DivinationLine]), AiModule],
  providers: [DivinationService],
  controllers: [DivinationController]
})
export class DivinationModule {}
