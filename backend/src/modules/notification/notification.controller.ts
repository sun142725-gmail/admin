// 通知管理控制器提供模板与发布接口。
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { CreateTemplateDto } from './dto/create-template.dto';
import { PublishNotificationDto } from './dto/publish-notification.dto';
import { QueryInboxDto } from './dto/query-inbox.dto';
import { QueryPublishDto } from './dto/query-publish.dto';
import { QueryTemplateDto } from './dto/query-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notification')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('templates')
  @Permissions('system:notification:template:list')
  async listTemplates(@Query() query: QueryTemplateDto) {
    return this.notificationService.listTemplates(query);
  }

  @Post('templates')
  @Permissions('system:notification:template:create')
  async createTemplate(@Body() payload: CreateTemplateDto) {
    return this.notificationService.createTemplate(payload);
  }

  @Patch('templates/:id')
  @Permissions('system:notification:template:update')
  async updateTemplate(@Param('id') id: string, @Body() payload: UpdateTemplateDto) {
    return this.notificationService.updateTemplate(Number(id), payload);
  }

  @Delete('templates/:id')
  @Permissions('system:notification:template:delete')
  async removeTemplate(@Param('id') id: string) {
    return this.notificationService.removeTemplate(Number(id));
  }

  @Post('publish')
  @Permissions('system:notification:publish:create')
  async publish(@Body() payload: PublishNotificationDto) {
    return this.notificationService.publish(payload);
  }

  @Get('publish')
  @Permissions('system:notification:publish:list')
  async listPublishes(@Query() query: QueryPublishDto) {
    return this.notificationService.listPublishes(query);
  }

  @Get('publish/:id')
  @Permissions('system:notification:publish:list')
  async publishDetail(@Param('id') id: string) {
    return this.notificationService.getPublishDetail(Number(id));
  }


  @Post('publish/:id/retry')
  @Permissions('system:notification:publish:retry')
  async retry(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.notificationService.retryPublish(Number(id), reason);
  }

  @Get('inbox')
  @Permissions('system:notification:inbox:list')
  async listInbox(@CurrentUser() user: RequestUser, @Query() query: QueryInboxDto) {
    return this.notificationService.listInbox(user.id, query);
  }

  @Patch('inbox/:id/read')
  @Permissions('system:notification:inbox:read')
  async markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationService.markInboxRead(user.id, Number(id));
  }

  @Patch('inbox/read-all')
  @Permissions('system:notification:inbox:read')
  async markReadAll(@CurrentUser() user: RequestUser) {
    return this.notificationService.markAllInboxRead(user.id);
  }
}
