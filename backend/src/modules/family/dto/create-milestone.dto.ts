// 创建大事纪 DTO 校验事件归属、标题、日期、关联成员与配图。
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength
} from 'class-validator';

export class CreateMilestoneDto {
  @IsEnum(['personal', 'family'])
  type!: 'personal' | 'family';

  @IsString()
  @Length(1, 50)
  title!: string;

  @IsString()
  @Matches(/^\d{4}-(\d{2})(-\d{2})?$/, { message: 'happenDate 格式应为 YYYY-MM 或 YYYY-MM-DD' })
  happenDate!: string;

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
