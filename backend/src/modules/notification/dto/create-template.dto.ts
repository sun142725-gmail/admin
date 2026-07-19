// 创建通知模板 DTO 用于参数校验。
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { NOTIFICATION_CHANNEL_TYPES } from '../notification.types';
import { NotificationVariableDto } from './notification-variable.dto';

export class CreateTemplateDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{2,63}$/, { message: '模板编码仅支持大写字母、数字、下划线，且需以字母开头' })
  code?: string;

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
