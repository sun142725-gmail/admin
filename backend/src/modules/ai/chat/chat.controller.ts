// AI 对话控制器：两段式流（POST 预启动 / GET SSE 订阅）。
import { Body, Controller, Delete, Get, MessageEvent, Param, ParseIntPipe, Post, Put, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { SetMetadata } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { SKIP_RESPONSE_WRAP_KEY } from '../../../common/constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequestUser } from '../../../common/interfaces/auth.interface';
import { AiChatService } from './chat.service';
import { ConversationsService } from './conversations.service';
import { ChatRequestDto, CreateConversationDto, RenameConversationDto } from './dto/chat.dto';

@ApiTags('AI Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/chat')
export class AiChatController {
  constructor(
    private readonly chatService: AiChatService,
    private readonly conversationsService: ConversationsService
  ) {}

  // ---------- 会话 ----------
  @Get('conversations')
  listConversations(@CurrentUser() user: RequestUser) {
    return this.conversationsService.list(user.id);
  }

  @Post('conversations')
  createConversation(@CurrentUser() user: RequestUser, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(user.id, dto);
  }

  @Get('conversations/:id/messages')
  listMessages(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.conversationsService.messages(user.id, id);
  }

  @Put('conversations/:id/title')
  renameConversation(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameConversationDto
  ) {
    return this.conversationsService.rename(user.id, id, dto.title);
  }

  @Delete('conversations/:id')
  removeConversation(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.conversationsService.remove(user.id, id);
  }

  // ---------- 对话 ----------
  // 第一步：提交内容，立即返回 conversationId + messageId。
  @Post('completions')
  async submit(@CurrentUser() user: RequestUser, @Body() dto: ChatRequestDto) {
    return this.chatService.submit(user.id, dto);
  }

  // 第二步：SSE 订阅生成流（事件：chunk / done / error），跳过统一响应包装。
  @Sse('stream/:messageId')
  @SetMetadata(SKIP_RESPONSE_WRAP_KEY, true)
  stream(
    @CurrentUser() user: RequestUser,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Query('trace') _trace?: string
  ): Observable<MessageEvent> {
    return this.chatService.stream(user.id, messageId);
  }
}
