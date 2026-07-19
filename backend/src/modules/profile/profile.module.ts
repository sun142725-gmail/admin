// 个人中心模块注册服务与控制器。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../common/entities/user.entity';
import { FileAsset } from '../../common/entities/file-asset.entity';
import { AuditModule } from '../audit/audit.module';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, FileAsset]), AuditModule, FilesModule],
  providers: [ProfileService],
  controllers: [ProfileController]
})
export class ProfileModule {}
