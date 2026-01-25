// 初始化模块用于触发默认数据写入。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../common/entities/user.entity';
import { Role } from '../../common/entities/role.entity';
import { Permission } from '../../common/entities/permission.entity';
import { Resource } from '../../common/entities/resource.entity';
import { Dict } from '../../common/entities/dict.entity';
import { DictItem } from '../../common/entities/dict-item.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Permission, Resource, Dict, DictItem])],
  providers: [SeedService]
})
export class SeedModule {}
