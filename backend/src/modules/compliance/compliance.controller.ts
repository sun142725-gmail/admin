// 合规检查链控制器：词库管理（compliance:view/manage）+ 发布前检查（publisher:manage）。
// check 挂 publisher:manage 与登记动作 POST /publisher/records（publisher.controller.ts:57）
// 同宽——能登记发布者必有 manage，check 是登记流程的内嵌前置步骤，权限面必须同宽：
// 「仅授 publisher:manage 无 publisher:view」是项目支持的合法登记配置，check 若挂 view 会把
// 该角色完全挡在登记流程外（检查失败阻断提交的 fail-safe 下）。
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ComplianceService } from './compliance.service';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';
import { QueryWordsDto } from './dto/query-words.dto';
import { RunComplianceCheckDto } from './dto/run-check.dto';

@ApiTags('Compliance')
@ApiBearerAuth()
@Controller('compliance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('words')
  @Permissions('compliance:view')
  async listWords(@Query() query: QueryWordsDto) {
    return this.complianceService.listWords(query);
  }

  @Post('words')
  @Permissions('compliance:manage')
  async createWord(@Body() payload: CreateWordDto) {
    return this.complianceService.createWord(payload);
  }

  @Patch('words/:id')
  @Permissions('compliance:manage')
  async updateWord(@Param('id') id: string, @Body() payload: UpdateWordDto) {
    return this.complianceService.updateWord(Number(id), payload);
  }

  @Delete('words/:id')
  @Permissions('compliance:manage')
  async removeWord(@Param('id') id: string) {
    return this.complianceService.removeWord(Number(id));
  }

  // 检查链执行入口：归属发布矩阵流程（权限同 publisher:manage），只读不落库。
  // 固定 200：检查是查询语义（前后端契约「照常 200 返回报告，blocked 是业务结论不是 HTTP 错误」），
  // 不落 Nest POST 默认 201。
  @Post('check')
  @HttpCode(200)
  @Permissions('publisher:manage')
  async runCheck(@Body() payload: RunComplianceCheckDto) {
    return this.complianceService.runCheck(payload);
  }
}
