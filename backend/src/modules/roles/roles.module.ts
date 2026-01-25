// 角色模块注册角色与权限实体。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../../common/entities/role.entity';
import { Permission } from '../../common/entities/permission.entity';
import { User } from '../../common/entities/user.entity';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, User]), AuditModule],
  providers: [RolesService],
  controllers: [RolesController]
})
export class RolesModule {}
