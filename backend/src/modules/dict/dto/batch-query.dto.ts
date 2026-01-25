// 批量字典查询 DTO 支持多 code 与语言参数。
import { IsOptional, IsString } from 'class-validator';

export class BatchQueryDto {
  @IsString()
  codes!: string;

  @IsOptional()
  @IsString()
  lang?: string;
}
