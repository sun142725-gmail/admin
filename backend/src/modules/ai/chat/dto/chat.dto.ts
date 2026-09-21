// AI 对话 DTO。
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsInt()
  agentId?: number;

  @IsOptional()
  @IsInt()
  modelId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string;
}

export class RenameConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  title!: string;
}

export class ChatRequestDto {
  @IsOptional()
  @IsInt()
  conversationId?: number;

  @IsOptional()
  @IsInt()
  agentId?: number;

  @IsOptional()
  @IsInt()
  modelId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
