// 更新待办 DTO 校验可选标题、执行人和截止日期。
import { IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  title?: string;

  @IsOptional()
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;
}
