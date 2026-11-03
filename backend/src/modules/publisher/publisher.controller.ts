// 发布矩阵控制器：账号管理、发布记录登记与数据回流指标（模板下载/CSV 导入/明细查询）。
// 读操作挂 publisher:view，写操作挂 publisher:manage；凭据任何响应不回传。
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, SetMetadata, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { SKIP_RESPONSE_WRAP_KEY } from '../../common/constants';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CreateRecordDto } from './dto/create-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { QueryMetricsDto } from './dto/query-metrics.dto';
import { PublisherService } from './publisher.service';

@ApiTags('Publisher')
@ApiBearerAuth()
@Controller('publisher')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PublisherController {
  constructor(private readonly publisherService: PublisherService) {}

  @Get('accounts')
  @Permissions('publisher:view')
  async listAccounts() {
    return this.publisherService.listAccounts();
  }

  @Post('accounts')
  @Permissions('publisher:manage')
  async createAccount(@Body() payload: CreateAccountDto) {
    return this.publisherService.createAccount(payload);
  }

  @Patch('accounts/:id')
  @Permissions('publisher:manage')
  async updateAccount(@Param('id') id: string, @Body() payload: UpdateAccountDto) {
    return this.publisherService.updateAccount(Number(id), payload);
  }

  @Delete('accounts/:id')
  @Permissions('publisher:manage')
  async removeAccount(@Param('id') id: string) {
    return this.publisherService.removeAccount(Number(id));
  }

  @Get('records')
  @Permissions('publisher:view')
  async listRecords(@Query() query: QueryRecordsDto) {
    return this.publisherService.listRecords(query);
  }

  @Post('records')
  @Permissions('publisher:manage')
  async createRecord(@Body() payload: CreateRecordDto) {
    return this.publisherService.createRecord(payload);
  }

  @Delete('records/:id')
  @Permissions('publisher:manage')
  async removeRecord(@Param('id') id: string) {
    return this.publisherService.removeRecord(Number(id));
  }

  // ---- 数据回流指标 ----

  // 模板下载：CSV 原样直写响应（SKIP_RESPONSE_WRAP_KEY 透传，照 chat.controller.ts:66 SSE 先例）
  @Get('metrics/template')
  @Permissions('publisher:view')
  @SetMetadata(SKIP_RESPONSE_WRAP_KEY, true)
  downloadTemplate(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="publisher-metrics-template.csv"');
    res.send(this.publisherService.buildTemplateCsv());
  }

  // CSV 导入：CSV 不落盘用 memoryStorage（files.controller.ts:54 的 2MB 上限先例），buffer 直喂解析
  @Post('metrics/import')
  @Permissions('publisher:manage')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async importMetrics(@UploadedFile() file?: Express.Multer.File) {
    return this.publisherService.importMetrics(file);
  }

  @Get('metrics')
  @Permissions('publisher:view')
  async listMetrics(@Query() query: QueryMetricsDto) {
    return this.publisherService.listMetrics(query);
  }
}
