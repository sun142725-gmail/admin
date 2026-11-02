// 用量聚合报表查询 DTO：时间窗口 / 模型 / 项目 / 调用类型筛选（query 参数数值转换照 query-stats.dto 先例）。
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';

export class UsageReportQueryDto {
  // 时间窗口（含边界），ISO 字符串；缺省不限。
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  modelId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  projectId?: number;

  @IsOptional()
  @IsIn(['chat', 'roundtable', 'image', 'video', 'tts'])
  kind?: string;
}
