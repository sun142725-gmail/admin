// 词库查询 DTO：分页 + level/status/keyword 过滤。
// keyword 为字面子串匹配：服务层转义 !/%/_ 并以 LIKE :kw ESCAPE '!' 执行
// （照 prompt-library.service.ts:257 仓库先例，keyword 中的通配符按字面命中）。
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { COMPLIANCE_LEVELS } from '../compliance.types';

export class QueryWordsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsIn([...COMPLIANCE_LEVELS])
  level?: string;

  @IsOptional()
  @IsIn([0, 1])
  @IsInt()
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  keyword?: string;
}
