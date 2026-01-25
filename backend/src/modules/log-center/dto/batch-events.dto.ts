// 批量日志上报 DTO 用于接收前端事件队列。
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LogEventDto } from './log-event.dto';

export class BatchEventsDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LogEventDto)
  events!: LogEventDto[];
}
