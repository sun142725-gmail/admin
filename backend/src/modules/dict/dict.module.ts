// 字典模块注册实体、服务与控制器。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dict } from '../../common/entities/dict.entity';
import { DictItem } from '../../common/entities/dict-item.entity';
import { DictCacheService } from './dict-cache.service';
import { DictController } from './dict.controller';
import { DictItemsController } from './dict-items.controller';
import { DictService } from './dict.service';

@Module({
  imports: [TypeOrmModule.forFeature([Dict, DictItem])],
  providers: [DictService, DictCacheService],
  controllers: [DictController, DictItemsController],
  exports: [DictService]
})
export class DictModule {}
