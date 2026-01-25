// 日志事件 DTO 用于批量上报。
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class LogEventDto {
  @IsIn(['track', 'frontend', 'error'])
  type!: 'track' | 'frontend' | 'error';

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsString()
  createdAt?: string;
}
