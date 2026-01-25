// 用户模块注册用户与角色实体。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../common/entities/user.entity';
import { Role } from '../../common/entities/role.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role]), AuditModule],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UsersModule {}
