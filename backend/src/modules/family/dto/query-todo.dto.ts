// 查询待办 DTO 校验状态和分页参数。
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTodoDto {
  @IsOptional()
  @IsIn(['pending', 'completed'])
  status?: 'pending' | 'completed';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
