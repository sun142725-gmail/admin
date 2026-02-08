// 通知变量 DTO 用于校验模板变量定义。
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { NOTIFICATION_VARIABLE_SOURCES, NotificationVariableSource } from '../notification.types';

export class NotificationVariableDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsIn(NOTIFICATION_VARIABLE_SOURCES)
  source!: NotificationVariableSource;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
