// 创建通知模板 DTO 用于参数校验。
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { NOTIFICATION_CHANNEL_TYPES } from '../notification.types';
import { NotificationVariableDto } from './notification-variable.dto';

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(NOTIFICATION_CHANNEL_TYPES, { each: true })
  channelTypes!: string[];

  @IsString()
  content!: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NotificationVariableDto)
  variables?: NotificationVariableDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  status?: number;
}
