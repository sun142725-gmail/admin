// 新增敏感词 DTO：word 服务层 trim 后入库与查重（唯一性以后端 trim 为准，前端 trim 仅 UX）；
// sqlite varchar 限长不生效，@Length 前置设防（照 publisher.service.ts:247 注释口径）。
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { COMPLIANCE_LEVELS } from '../compliance.types';

export class CreateWordDto {
  @IsString()
  @Length(1, 64)
  word!: string;

  @IsIn([...COMPLIANCE_LEVELS])
  level!: string;

  @IsOptional()
  @IsIn([0, 1])
  @IsInt()
  status?: number;

  // 替换建议词（replace 级提示用，其他级可空）
  @IsOptional()
  @IsString()
  @Length(0, 64)
  suggestion?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  remark?: string;
}
