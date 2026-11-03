// 合规检查链模块：敏感词库（独立配置域模型 + 独立权限码 compliance:view/manage）与
// 发布前检查链。检查链的执行入口仍归属发布矩阵流程（POST /compliance/check 挂
// publisher:manage，与登记动作权限同宽），故本模块与发布矩阵模块职责分离。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceWord } from '../../common/entities/compliance-words.entity';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [TypeOrmModule.forFeature([ComplianceWord])],
  controllers: [ComplianceController],
  providers: [ComplianceService]
})
export class ComplianceModule {}
