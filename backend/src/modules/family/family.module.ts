// 家庭模块注册家庭协作相关实体、控制器与服务。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Family } from '../../common/entities/family.entity';
import { FamilyMember } from '../../common/entities/family-member.entity';
import { FamilyInviteCode } from '../../common/entities/family-invite-code.entity';
import { FamilyTodo } from '../../common/entities/family-todo.entity';
import { FamilyAnnouncement } from '../../common/entities/family-announcement.entity';
import { User } from '../../common/entities/user.entity';
import { UserSetting } from '../../common/entities/user-setting.entity';
import { UserIdentifier } from '../../common/entities/user-identifier.entity';
import { FamilyController } from './family.controller';
import { MobileUserController } from './mobile-user.controller';
import { FamilyService } from './family.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Family,
      FamilyMember,
      FamilyInviteCode,
      FamilyTodo,
      FamilyAnnouncement,
      User,
      UserSetting,
      UserIdentifier
    ])
  ],
  controllers: [FamilyController, MobileUserController],
  providers: [FamilyService],
  exports: [FamilyService]
})
export class FamilyModule {}
