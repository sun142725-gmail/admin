// 更新大事纪 DTO 校验允许修改的可选字段。
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength
} from 'class-validator';

export class UpdateMilestoneDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(\d{2})(-\d{2})?$/, { message: 'happenDate 格式应为 YYYY-MM 或 YYYY-MM-DD' })
  happenDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string;

  @IsOptional()
  @IsBoolean()
  isCore?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  relatedMemberIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  imageList?: string[];
}
