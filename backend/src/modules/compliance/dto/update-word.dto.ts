// 更新敏感词 DTO：全部可选（不传不改）；word 改动同样服务层 trim 后查重。
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { COMPLIANCE_LEVELS } from '../compliance.types';

export class UpdateWordDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  word?: string;

  @IsOptional()
  @IsIn([...COMPLIANCE_LEVELS])
  level?: string;

  @IsOptional()
  @IsIn([0, 1])
  @IsInt()
  status?: number;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  suggestion?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  remark?: string | null;
}
