// 发布矩阵控制器：账号管理与发布记录登记。
// 读操作挂 publisher:view，写操作挂 publisher:manage；凭据任何响应不回传。
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CreateRecordDto } from './dto/create-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
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
}
